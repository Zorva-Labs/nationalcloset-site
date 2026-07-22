// GET  /api/email-messages?lead_id=…&contact_id=…&project_id=…&thread_key=…
//      — list messages threaded by send time (newest first)
// POST /api/email-messages
//      — render template (if template_id passed), send via SMTP, log to D1
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";
import { sendEmail, makeMessageId } from "../../_lib/email.js";
import { renderTemplate, buildEmailContext, deriveThreadKey } from "../../_lib/email-vars.js";
import { bumpLeadStatusForward } from "../../_lib/lifecycle.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const leadId    = parseIntOrNull(url.searchParams.get("lead_id"));
  const contactId = parseIntOrNull(url.searchParams.get("contact_id"));
  const projectId = parseIntOrNull(url.searchParams.get("project_id"));
  const threadKey = url.searchParams.get("thread_key");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

  // Global inbox view: every inbound message, attached or not. Admin-only
  // (requireAuth above). This is what makes unmatched mail — senders who aren't
  // yet a contact/lead — visible instead of silently invisible.
  if (url.searchParams.get("inbox")) {
    const rows = (await context.env.DB.prepare(
      `SELECT m.id, m.from_name, m.from_addr, m.subject, m.body_text,
              m.received_at, m.created_at, m.contact_id, m.lead_id, m.project_id,
              c.name AS contact_name, p.name AS project_name
         FROM email_messages m
         LEFT JOIN contacts c ON c.id = m.contact_id
         LEFT JOIN projects p ON p.id = m.project_id
        WHERE m.direction = 'in'
        ORDER BY COALESCE(m.received_at, m.created_at) DESC
        LIMIT ${limit}`
    ).all()).results || [];
    return json({ messages: rows });
  }

  const where = []; const binds = [];
  // When the caller filters by project_id, ALSO include any messages whose
  // lead_id matches the project's originating lead — that covers the
  // pre-contract window where the record was still a Lead and outbound
  // emails got lead_id but no project_id. Same idea in reverse for lead_id
  // filters: include messages on any project that descends from the lead.
  // This makes the thread continuous across the lead→job transition.
  if (projectId != null) {
    binds.push(projectId, projectId);
    where.push(`(project_id=?${binds.length - 1} OR lead_id IN (SELECT lead_id FROM projects WHERE id=?${binds.length} AND lead_id IS NOT NULL))`);
  }
  if (leadId    != null) {
    binds.push(leadId, leadId);
    where.push(`(lead_id=?${binds.length - 1} OR project_id IN (SELECT id FROM projects WHERE lead_id=?${binds.length}))`);
  }
  if (contactId != null) {
    // Same idea as the project/lead filters above: a contact's messages
    // include anything stamped with this contact_id PLUS messages on any
    // of their leads or projects (lead/project rows may exist before the
    // contact_id was wired up on email_messages). This makes the Contact
    // page show the full conversation history without depending on perfect
    // denormalization.
    binds.push(contactId, contactId, contactId);
    where.push(`(contact_id=?${binds.length - 2}
                 OR project_id IN (SELECT id FROM projects WHERE contact_id=?${binds.length - 1})
                 OR lead_id    IN (SELECT id FROM leads    WHERE contact_id=?${binds.length}))`);
  }
  if (threadKey)         { binds.push(threadKey); where.push(`thread_key=?${binds.length}`); }

  // Refuse open-ended queries — too easy to dump the inbox via the public-ish
  // /crm/ surface if a token leaks. Require at least one entity filter.
  if (!where.length) return json({ error: "filter required" }, 400);

  const sql = `SELECT * FROM email_messages WHERE ${where.join(" AND ")}
               ORDER BY COALESCE(sent_at, received_at, created_at) DESC LIMIT ${limit}`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ messages: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  const { DB } = context.env;

  // Required: at least one recipient + a subject + a body (or a template_id)
  const to = normalizeList(body.to);
  if (!to.length) return json({ error: "to required" }, 400);

  // Attachments: base64 sent inline in the payload (no upload round-trip).
  // Validate shape + a hard size ceiling so a bad client can't push a huge body
  // past the provider limit. 15MB raw ≈ 20MB base64, comfortably under Resend's.
  let attachments = [];
  if (Array.isArray(body.attachments) && body.attachments.length) {
    let rawBytes = 0;
    for (const a of body.attachments) {
      const filename = (a?.filename || "file").toString().slice(0, 200);
      const content = (a?.content || "").toString();
      if (!content) return json({ error: `attachment "${filename}" is empty` }, 400);
      rawBytes += Math.floor(content.length * 0.75);  // base64 → raw byte estimate
      attachments.push({ filename, content, content_type: (a?.content_type || "application/octet-stream").toString().slice(0, 120) });
    }
    if (attachments.length > 10) return json({ error: "too many attachments (max 10)" }, 400);
    if (rawBytes > 15 * 1024 * 1024) return json({ error: "attachments exceed 15 MB" }, 413);
  }

  // Load + render template if template_id passed. The admin can also pass
  // freeform subject/body_text/body_html which overrides the template.
  let subject = body.subject;
  let bodyText = body.body_text;
  let bodyHtml = body.body_html;
  let templateRow = null;
  let templateKind = null;
  if (body.template_id) {
    templateRow = await DB.prepare(`SELECT * FROM email_templates WHERE id=?1 AND is_active=1`).bind(body.template_id).first();
    if (!templateRow) return json({ error: "template not found" }, 404);
    templateKind = templateRow.kind;
    subject  = subject  ?? templateRow.subject;
    bodyText = bodyText ?? templateRow.body_text;
    bodyHtml = bodyHtml ?? templateRow.body_html;
  }

  // Variable substitution — build context from whatever entity FKs were passed
  const ctx = await buildEmailContext(DB, {
    contact: body.contact_id ? { contact_id: body.contact_id } : null,
    lead:    body.lead_id    ? { lead_id: body.lead_id }       : null,
    project: body.project_id ? { project_id: body.project_id } : null,
  });
  // Allow caller to pass appointment_date/time + arbitrary extra vars
  const vars = { ...ctx, ...(body.vars || {}) };
  subject  = renderTemplate(subject, vars);
  bodyText = renderTemplate(bodyText, vars);
  bodyHtml = renderTemplate(bodyHtml, vars);

  if (!subject)  return json({ error: "subject required" }, 400);
  if (!bodyText && !bodyHtml) return json({ error: "body required" }, 400);

  // Generate the Message-ID up front so we can log it immediately
  const messageId = makeMessageId();
  // Threading: if this is a reply, pick up the parent's Message-ID + References
  let inReplyTo = body.in_reply_to || null;
  let references = body.references || null;
  if (body.parent_message_id) {
    const parent = await DB.prepare(`SELECT message_id_header, references_header FROM email_messages WHERE id=?1`).bind(body.parent_message_id).first();
    if (parent) {
      inReplyTo = parent.message_id_header || inReplyTo;
      references = parent.references_header ? `${parent.references_header} ${parent.message_id_header}`.trim() : parent.message_id_header;
    }
  }

  // Peer email = first non-admin recipient (used to derive a coarse thread_key)
  const peerEmail = extractAddr(to[0]);
  const threadKey = deriveThreadKey(subject, peerEmail);

  // Denormalize the entity links: if the caller passed project_id (typical
  // for Compose from the Job page) AND that project came from a lead, also
  // stamp the row with lead_id. Same in reverse — if lead_id is passed and
  // the lead has a project, stamp project_id. Likewise contact_id falls out
  // of either side. Keeps the GET timeline queries cheap regardless of which
  // entity side filters.
  let rowLeadId    = body.lead_id    || null;
  let rowProjectId = body.project_id || null;
  let rowContactId = body.contact_id || null;
  if (rowProjectId && (!rowLeadId || !rowContactId)) {
    const proj = await DB.prepare(`SELECT lead_id, contact_id FROM projects WHERE id=?1`).bind(rowProjectId).first().catch(() => null);
    if (proj?.lead_id    && !rowLeadId)    rowLeadId    = proj.lead_id;
    if (proj?.contact_id && !rowContactId) rowContactId = proj.contact_id;
  }
  if (rowLeadId && (!rowProjectId || !rowContactId)) {
    const lead = await DB.prepare(`SELECT contact_id FROM leads WHERE id=?1`).bind(rowLeadId).first().catch(() => null);
    if (lead?.contact_id && !rowContactId) rowContactId = lead.contact_id;
    if (!rowProjectId) {
      const proj = await DB.prepare(`SELECT id FROM projects WHERE lead_id=?1 ORDER BY id DESC LIMIT 1`).bind(rowLeadId).first().catch(() => null);
      if (proj?.id) rowProjectId = proj.id;
    }
  }

  // Insert "queued" row first — guarantees we have a CRM record even if SMTP fails.
  const insert = await DB.prepare(
    `INSERT INTO email_messages
       (direction, status, contact_id, lead_id, project_id,
        message_id_header, in_reply_to, references_header, thread_key,
        from_name, from_addr, to_addrs, cc_addrs, bcc_addrs, reply_to,
        subject, body_text, body_html,
        template_id, template_kind, author_user_id, attachments_meta)
     VALUES ('out', 'queued', ?1, ?2, ?3,
        ?4, ?5, ?6, ?7,
        ?8, ?9, ?10, ?11, ?12, ?13,
        ?14, ?15, ?16,
        ?17, ?18, ?19, ?20) RETURNING id`
  ).bind(
    rowContactId, rowLeadId, rowProjectId,
    messageId, inReplyTo, references, threadKey,
    "National Closet Company", context.env.PURELYMAIL_USER || "hello@nationalclosetco.com",
    JSON.stringify(to),
    body.cc ? JSON.stringify(normalizeList(body.cc)) : null,
    body.bcc ? JSON.stringify(normalizeList(body.bcc)) : null,
    body.reply_to || null,
    subject, bodyText || null, bodyHtml || null,
    body.template_id || null, templateKind, auth.id,
    // Store only metadata (name/type/size) — never the base64 bytes, which would
    // bloat the row and the thread view for no benefit.
    attachments.length ? JSON.stringify(attachments.map((a) => ({
      filename: a.filename, content_type: a.content_type, bytes: Math.floor(a.content.length * 0.75),
    }))) : null,
  ).first();
  const msgId = insert.id;

  // Send via SMTP
  const sendResult = await sendEmail(context.env, {
    to, cc: body.cc, bcc: body.bcc, subject,
    text: bodyText, html: bodyHtml,
    replyTo: body.reply_to,
    messageId, inReplyTo, references,
    attachments: attachments.length ? attachments : undefined,
  });

  // Update D1 row with the actual outcome
  if (sendResult.skipped || sendResult.error) {
    await DB.prepare(
      `UPDATE email_messages SET status='failed', error_code=?1, error_message=?2, sent_at=datetime('now')
       WHERE id=?3`
    ).bind(
      sendResult.reason || "smtp_error",
      (sendResult.error || "send_failed").toString().slice(0, 240),
      msgId,
    ).run();
    return json({ id: msgId, ok: false, error: sendResult.error || sendResult.reason || "send_failed" }, 502);
  }
  await DB.prepare(
    `UPDATE email_messages SET status='sent', sent_at=datetime('now') WHERE id=?1`
  ).bind(msgId).run();

  // Auto-advance the lead to "contacted" the first time we email them.
  // Forward-only — a lead already at replied/proposal/booked stays put. If the
  // email is attached to a project (later stage of the relationship) we look up
  // the lead via project.lead_id so post-contact emails still attribute properly.
  // (An inbound REPLY from the lead bumps them on to "replied" — see email-sync.)
  let leadIdForBump = body.lead_id || null;
  if (!leadIdForBump && body.project_id) {
    const proj = await DB.prepare(`SELECT lead_id FROM projects WHERE id=?1`).bind(body.project_id).first().catch(() => null);
    leadIdForBump = proj?.lead_id || null;
  }
  if (leadIdForBump) {
    await bumpLeadStatusForward(DB, leadIdForBump, "contacted", { actor: { kind: "admin", id: auth.id, name: auth.email } });
  }

  await recordActivity(DB, {
    entityType: body.lead_id ? "lead" : body.project_id ? "project" : body.contact_id ? "contact" : "email_message",
    entityId: body.lead_id || body.project_id || body.contact_id || msgId,
    action: "email-sent",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { message_id: msgId, subject, to, template_kind: templateKind },
  });

  return json({ id: msgId, ok: true, status: "sent", message_id: messageId });
}

// ───── helpers ─────
function parseIntOrNull(s) { const n = parseInt(s || "", 10); return Number.isFinite(n) ? n : null; }
function normalizeList(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return String(v).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
}
function extractAddr(s) { const m = String(s || "").match(/<([^>]+)>/); return (m ? m[1] : s).trim(); }
