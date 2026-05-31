// Log an outbound email into email_messages so EVERY message we send — manual
// or automated (stage notifications, proposals, contracts) — shows up in the
// Messages thread alongside inbound replies.
//
// Best-effort: never throws. Returns the new row id (or null).
import { deriveThreadKey } from "./email-vars.js";

function firstAddr(to) {
  const list = Array.isArray(to) ? to : [to];
  const s = String(list[0] || "");
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim();
}

export async function logOutboundEmail(env, {
  to, subject, html, text, messageId,
  projectId = null, contactId = null, leadId = null,
  templateId = null, templateKind = null,
  status = "sent", actorId = null, errorCode = null, errorMessage = null,
}) {
  try {
    const db = env.DB;
    // Denormalize the entity links so the timeline query finds the message
    // from the project, lead, or contact side regardless of which was passed.
    let pId = projectId, lId = leadId, cId = contactId;
    if (pId && (!lId || !cId)) {
      const p = await db.prepare(`SELECT lead_id, contact_id FROM projects WHERE id=?1`).bind(pId).first().catch(() => null);
      if (p?.lead_id && !lId) lId = p.lead_id;
      if (p?.contact_id && !cId) cId = p.contact_id;
    }
    if (lId && !cId) {
      const l = await db.prepare(`SELECT contact_id FROM leads WHERE id=?1`).bind(lId).first().catch(() => null);
      if (l?.contact_id) cId = l.contact_id;
    }
    const toList = Array.isArray(to) ? to : [to].filter(Boolean);
    const threadKey = deriveThreadKey(subject, firstAddr(toList));
    const fromAddr = env.PURELYMAIL_USER || env.MAIL_DEFAULT_REPLY || "hello@nationalclosetco.com";
    const r = await db.prepare(
      `INSERT INTO email_messages
         (direction, status, contact_id, lead_id, project_id,
          message_id_header, thread_key,
          from_name, from_addr, to_addrs, reply_to,
          subject, body_text, body_html,
          template_id, template_kind, author_user_id,
          error_code, error_message, sent_at)
       VALUES ('out', ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, datetime('now'))
       RETURNING id`
    ).bind(
      status, cId, lId, pId,
      messageId || null, threadKey,
      "National Closet Company", fromAddr, JSON.stringify(toList), fromAddr,
      subject, text || null, html || null,
      templateId, templateKind, actorId,
      errorCode, errorMessage,
    ).first();
    return r?.id || null;
  } catch (e) {
    console.error("[email-log]", String(e));
    return null;
  }
}
