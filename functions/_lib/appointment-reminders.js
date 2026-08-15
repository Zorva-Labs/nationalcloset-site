// Morning-of consultation reminder sweep. Idempotent — safe to call on every
// cron tick. For each client visit (consultation/measure) happening LATER TODAY
// in Central Time, once it's past ~7am Central, email the customer a friendly
// reminder and stamp reminder_sent_at so it only goes out once.
import { sendEmail, brandedEmail, escapeHtml, makeMessageId } from "./email.js";
import { logOutboundEmail } from "./email-log.js";
import { recordActivity } from "./db.js";

const SITE_URL = "https://nationalclosetco.com";

// UTC "YYYY-MM-DD HH:MM:SS" (or ISO) → Central clock time, e.g. "2:00 PM".
function fmtTimeCentral(startAt) {
  if (!startAt) return "";
  const s = String(startAt).trim();
  const iso = s.includes("T") ? s : s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

export async function sweepConsultationReminders(env) {
  const DB = env && env.DB;
  if (!DB) return { reminded: 0 };

  // Central-time "today", the visit is still upcoming, and it's morning (>= 7am
  // Central) so the reminder lands in the morning, not at UTC midnight.
  const due = (await DB.prepare(
    `SELECT id, type, start_at, name, email, site_address, rooms, cancel_token,
            contact_id, project_id, lead_id
       FROM appointments
      WHERE LOWER(COALESCE(type,'consultation')) IN ('consultation','measure')
        AND LOWER(COALESCE(status,'')) NOT IN ('canceled','cancelled','no_show','completed','done')
        AND reminder_sent_at IS NULL
        AND start_at > datetime('now')
        AND date(start_at,'-5 hours') = date('now','-5 hours')
        AND CAST(strftime('%H', datetime('now','-5 hours')) AS INTEGER) >= 7`
  ).all()).results || [];

  let reminded = 0;
  for (const a of due) {
    // Stamp first so a mid-loop failure can't double-send on the next tick.
    await DB.prepare(`UPDATE appointments SET reminder_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`).bind(a.id).run();
    if (!a.email) continue;

    const first = (a.name || "there").split(" ")[0];
    const time = fmtTimeCentral(a.start_at);
    const isMeasure = (a.type || "consultation").toLowerCase() === "measure";
    const visitLabel = isMeasure ? "measure & design visit" : "in-home consultation";
    const cancelUrl = `${SITE_URL}/book/?cancel=${a.cancel_token || ""}`;
    const subject = `Reminder: your ${visitLabel} is today${time ? ` at ${time}` : ""}`;

    const html = brandedEmail({
      title: `Your ${visitLabel} is today.`,
      preheader: `See you today${time ? ` at ${time}` : ""} — National Closet Company.`,
      body: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>Just a friendly reminder that your free ${escapeHtml(visitLabel)} with National Closet Company is <strong>today${time ? ` at ${escapeHtml(time)}` : ""}</strong>.</p>
        ${a.site_address ? `<p>We'll come to:<br/><strong>${escapeHtml(a.site_address)}</strong></p>` : ""}
        ${a.rooms ? `<p><strong>Rooms / scope:</strong> ${escapeHtml(a.rooms)}</p>` : ""}
        <p>We'll take measurements, design a 3D version of the space, and leave you with a quote — no obligation. Plan on about 45–60 minutes.</p>
        <p>If today no longer works, you can <a href="${cancelUrl}">reschedule or cancel here</a>, or call/text us at <a href="tel:+16292988241">629-298-8241</a>.</p>
        <p style="margin-top:24px">See you soon,<br/>— National Closet Company</p>`,
    });
    const text = `Reminder: your ${visitLabel} with National Closet Company is today${time ? ` at ${time}` : ""}.\n` +
      (a.site_address ? `\nAddress: ${a.site_address}\n` : "") +
      `\nReschedule or cancel: ${cancelUrl}\nQuestions: 629-298-8241\n`;

    const messageId = makeMessageId();
    const res = await sendEmail(env, {
      to: a.name ? `${a.name} <${a.email}>` : a.email,
      subject, html, text, messageId,
    });
    const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
    await logOutboundEmail(env, {
      to: a.email, subject, html, text, messageId,
      leadId: a.lead_id || null, contactId: a.contact_id || null, projectId: a.project_id || null,
      templateKind: "consult_reminder", status: failed ? "failed" : "sent",
    }).catch(() => {});
    await recordActivity(DB, {
      entityType: "appointment", entityId: a.id, action: "consult-reminder-sent",
      actorKind: "system", actorName: "auto-scheduler",
      details: { to: a.email, start_at: a.start_at },
    }).catch(() => {});
    if (!failed) reminded++;
  }
  return { reminded };
}
