// Automatic Google-review requests. Idempotent — safe on every cron tick.
//
//  1. The morning after an install is marked completed: the "Ask for a Google
//     review" template (kind review_request) goes to the project's contact.
//  2. Two days after a design visit (consultation / measure) that did not
//     turn into a signed job: the post-visit template (review_request_visit).
//     Skipped for leads marked lost, and for anyone who already has a signed,
//     scheduled, installing or completed project (they get #1 instead).
//
// Both send only between 9am and 8pm Central, only once per contact in 90
// days, in batches of ten per tick, and stamp review_requested_at so a row is
// never asked twice. Templates are the editable rows in email_templates.
import { sendEmail, makeMessageId, brandedEmail } from "./email.js";
import { buildEmailContext, renderTemplate } from "./email-vars.js";
import { logOutboundEmail } from "./email-log.js";
import { recordActivity } from "./db.js";
import { centralNow } from "./dates.js";

async function template(db, kind) {
  return db.prepare(`SELECT * FROM email_templates WHERE kind = ?1 AND is_active = 1 ORDER BY is_default DESC, id LIMIT 1`).bind(kind).first();
}

async function sendTemplate(env, tpl, { contactId, projectId = null, leadId = null, fallbackName, email, kind }) {
  const db = env.DB;
  const ctx = await buildEmailContext(db, {
    contact: { contact_id: contactId },
    project: projectId ? { project_id: projectId } : undefined,
  }).catch(() => ({}));
  const fallbackFirst = (fallbackName || "there").trim().split(/\s+/)[0];
  const vars = { ...ctx, name: ctx.name || fallbackName || "", first_name: ctx.first_name || fallbackFirst };
  const subject = renderTemplate(tpl.subject, vars) || "How did we do?";
  const bodyText = renderTemplate(tpl.body_text || "", vars);
  const innerHtml = tpl.body_html
    ? renderTemplate(tpl.body_html, vars)
    : `<p>${(bodyText || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>').replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
  const html = brandedEmail({ title: renderTemplate(tpl.name || subject, vars), body: innerHtml, signature: false });
  const to = [fallbackName ? `${fallbackName} <${email}>` : email];
  const messageId = makeMessageId();
  const res = await sendEmail(env, { to, subject, html, text: bodyText, messageId });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to, subject, html, text: bodyText, messageId,
    projectId, contactId, leadId, templateId: tpl.id, templateKind: kind,
    status: failed ? "failed" : "sent",
    errorCode: failed ? (res?.reason || "send_error") : null,
    errorMessage: failed ? (res?.error || "send_failed").toString().slice(0, 240) : null,
  }).catch(() => {});
  return !failed;
}

export async function sweepReviewRequests(env) {
  const db = env && env.DB;
  if (!db) return { installs: 0, visits: 0 };
  // Central wall clock from the IANA zone (UTC-5 in daylight time, UTC-6 in standard).
  const now = centralNow();
  const hour = now.hour;
  if (hour < 9 || hour >= 20) return { installs: 0, visits: 0, skipped: "outside_hours" };

  let installs = 0, visits = 0;

  // 1) Completed installs — the morning after (12h+ since completion), within
  //    45 days so an old backlog never fires all at once.
  const tplInstall = await template(db, "review_request");
  if (tplInstall) {
    const due = (await db.prepare(
      `SELECT p.id, p.contact_id, p.lead_id, c.name AS contact_name, c.email
         FROM projects p JOIN contacts c ON c.id = p.contact_id
        WHERE p.status = 'completed' AND p.review_requested_at IS NULL
          AND c.email IS NOT NULL AND c.email != '' AND c.email NOT LIKE '%@nationalclosetco.com'
          AND datetime(p.updated_at) <= datetime('now', '-12 hours')
          AND datetime(p.updated_at) >= datetime('now', '-45 days')
          AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.contact_id = p.contact_id
                            AND m.template_kind IN ('review_request', 'review_request_visit')
                            AND m.created_at >= datetime('now', '-90 days'))
        ORDER BY p.updated_at LIMIT 10`
    ).all()).results || [];
    for (const p of due) {
      // Stamp first, so a send that hangs can never be retried into a duplicate.
      await db.prepare(`UPDATE projects SET review_requested_at = datetime('now') WHERE id = ?1`).bind(p.id).run();
      const ok = await sendTemplate(env, tplInstall, { contactId: p.contact_id, projectId: p.id, leadId: p.lead_id, fallbackName: p.contact_name, email: p.email, kind: "review_request" }).catch(() => false);
      if (ok) installs++;
      await recordActivity(db, {
        entityType: "project", entityId: p.id, action: ok ? "review-request-sent" : "review-request-failed",
        actorKind: "system", actorId: null, actorName: "auto-reviews", details: { to: p.email },
      }).catch(() => {});
    }
  }

  // 2) Design visits — two days after, for people who have not signed.
  const tplVisit = await template(db, "review_request_visit");
  if (tplVisit) {
    const due = (await db.prepare(
      `SELECT a.id, a.contact_id, a.lead_id, a.name, a.email
         FROM appointments a
        WHERE LOWER(COALESCE(a.type, 'consultation')) IN ('consultation', 'measure')
          AND LOWER(COALESCE(a.status, '')) IN ('confirmed', 'completed', 'done')
          AND a.review_requested_at IS NULL
          AND a.email IS NOT NULL AND a.email != '' AND a.email NOT LIKE '%@nationalclosetco.com'
          -- end_at is a LOCAL CENTRAL wall-clock string; ?1 is Central "now".
          AND datetime(a.end_at) <= datetime(?1, '-2 days')
          AND datetime(a.end_at) >= datetime(?1, '-30 days')
          AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.contact_id = a.contact_id
                            AND p.status IN ('contracted', 'scheduled_install', 'installing', 'completed'))
          AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = a.lead_id AND l.status = 'lost')
          AND NOT EXISTS (SELECT 1 FROM email_messages m WHERE m.contact_id = a.contact_id
                            AND m.template_kind IN ('review_request', 'review_request_visit')
                            AND m.created_at >= datetime('now', '-90 days'))
        ORDER BY a.end_at LIMIT 10`
    ).bind(now.iso).all()).results || [];
    const asked = new Set();
    for (const a of due) {
      await db.prepare(`UPDATE appointments SET review_requested_at = datetime('now') WHERE id = ?1`).bind(a.id).run();
      // Two visits with the same person in one sweep get one email, not two.
      if (asked.has(a.contact_id || a.email)) continue;
      asked.add(a.contact_id || a.email);
      const ok = await sendTemplate(env, tplVisit, { contactId: a.contact_id, leadId: a.lead_id, fallbackName: a.name, email: a.email, kind: "review_request_visit" }).catch(() => false);
      if (ok) visits++;
      await recordActivity(db, {
        entityType: "appointment", entityId: a.id, action: ok ? "review-request-sent" : "review-request-failed",
        actorKind: "system", actorId: null, actorName: "auto-reviews", details: { to: a.email },
      }).catch(() => {});
    }
  }
  return { installs, visits };
}
