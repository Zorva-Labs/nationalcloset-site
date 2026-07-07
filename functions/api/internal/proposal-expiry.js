// Proposal expiration sweep — runs on the same cron as advance-jobs.
//
// Two jobs, both idempotent so the 3-minute cron can call it safely:
//   1) Reminder — for any still-open proposal whose 2-day window closes within
//      the next 24h, email the customer once ("expires tomorrow") with the same
//      price-fluctuation explanation that's on the proposal + original email.
//      expiry_reminder_sent_at guards against re-sending (re-armed on resend).
//   2) Expire — flip any still-open proposal past its valid_until to 'expired'
//      so the pipeline/reporting reflect it (the public page already shows the
//      expired state live via a computed flag).
//
// Auth: Bearer token matching env.CRON_SECRET, OR an admin session cookie
// (so the admin can trigger a manual sweep from the CRM if needed).
import { requireAuth, json } from "../../_lib/auth.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../_lib/email.js";
import { recordActivity } from "../../_lib/db.js";
import { logOutboundEmail } from "../../_lib/email-log.js";
import { EXPIRY_DAYS, expiryReasonHtml } from "../../_lib/proposal-expiry.js";

const SITE_URL = "https://nationalclosetco.com";
const OPEN_STATUSES = "('sent','viewed','tier_selected')";

async function authenticate(context) {
  const authHeader = context.request.headers.get("Authorization") || "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer && context.env.CRON_SECRET && bearer === context.env.CRON_SECRET) {
    return { ok: true, actor: "cron" };
  }
  const session = await requireAuth(context);
  if (session && !(session instanceof Response)) return { ok: true, actor: "admin", id: session.id };
  return { ok: false };
}

async function sweep(context) {
  const auth = await authenticate(context);
  if (!auth.ok) return json({ error: "Unauthorized" }, 401);
  const { DB } = context.env;

  // ── 1) Reminders: open proposals expiring within the next 24h, not yet reminded ──
  const dueReminders = (await DB.prepare(
    `SELECT pr.id, pr.number, pr.view_token, pr.valid_until, pr.project_id,
            pj.name AS project_name, c.name AS contact_name, c.email AS contact_email
       FROM proposals pr
       JOIN projects pj ON pj.id = pr.project_id
       JOIN contacts  c ON c.id = pj.contact_id
      WHERE pr.status IN ${OPEN_STATUSES}
        AND pr.valid_until IS NOT NULL
        AND pr.expiry_reminder_sent_at IS NULL
        AND pr.valid_until > datetime('now')
        AND pr.valid_until <= datetime('now','+1 day')`
  ).all()).results || [];

  let reminded = 0;
  for (const p of dueReminders) {
    // Stamp first so a mid-loop failure can't cause a duplicate on the next tick.
    await DB.prepare(`UPDATE proposals SET expiry_reminder_sent_at=datetime('now') WHERE id=?1`).bind(p.id).run();
    if (!p.contact_email) continue;

    const url = `${SITE_URL}/proposal/?t=${p.view_token}`;
    const subject = `Your proposal expires soon — ${p.number}`;
    const html = brandedEmail({
      title: "Your proposal expires tomorrow.",
      preheader: `Accept ${p.number} before it expires to lock in your pricing.`,
      body: `
        <p>Hi ${escapeHtml((p.contact_name || "there").split(" ")[0])},</p>
        <p>Just a friendly heads-up that your proposal for <strong>${escapeHtml(p.project_name || "your project")}</strong> (<strong>${escapeHtml(p.number)}</strong>) is about to expire.</p>
        ${expiryReasonHtml(p.valid_until)}
        <p>If it still looks good, open it and accept before then to lock in your pricing — or just reply with any questions and we'll be glad to help.</p>`,
      ctaLabel: "Review &amp; Accept Your Proposal",
      ctaUrl: url,
    });
    const result = await sendEmail(context.env, { to: p.contact_email, subject, html });
    const failed = result?.skipped || result?.error || (result?.status && result.status >= 400);
    await logOutboundEmail(context.env, {
      to: p.contact_email, subject, html, messageId: result?.messageId,
      projectId: p.project_id, templateKind: "proposal_expiring",
      status: failed ? "failed" : "sent", actorId: null,
      errorCode: failed ? (result?.reason || "send_error") : null,
      errorMessage: failed ? (result?.error || "send_failed").toString().slice(0, 240) : null,
    }).catch(() => {});
    await recordActivity(DB, {
      entityType: "proposal", entityId: p.id, action: "expiry-reminder-sent",
      actorKind: "system", actorName: "auto-scheduler",
      details: { to: p.contact_email, valid_until: p.valid_until },
    }).catch(() => {});
    if (!failed) reminded++;
  }

  // ── 2) Expire: open proposals whose window has closed ──
  const nowPast = (await DB.prepare(
    `SELECT id FROM proposals
      WHERE status IN ${OPEN_STATUSES}
        AND valid_until IS NOT NULL
        AND valid_until <= datetime('now')`
  ).all()).results || [];
  for (const p of nowPast) {
    await DB.prepare(`UPDATE proposals SET status='expired', updated_at=datetime('now') WHERE id=?1`).bind(p.id).run();
    await recordActivity(DB, {
      entityType: "proposal", entityId: p.id, action: "expired",
      actorKind: "system", actorName: "auto-scheduler",
      details: { after_days: EXPIRY_DAYS },
    }).catch(() => {});
  }

  return json({ ok: true, reminded, expired: nowPast.length });
}

export const onRequestPost = sweep;
export const onRequestGet = sweep;
