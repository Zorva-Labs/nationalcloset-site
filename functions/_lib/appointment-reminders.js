// The customer's reminders: the day before and the morning of every visit on
// the CRM calendar. Idempotent — safe to call on every cron tick.
//
//   Appointments (consultation, measure, install, service): a reminder the day
//   before (9am–8pm Central) and one the morning of (from 7am Central, while the
//   visit is still ahead).
//   Installs on a job (projects.install_date): the reminder the day before is
//   sendInstallEveReminders below; the morning-of one is the "installing" stage
//   email, sent when advance-jobs moves the job at 7am Central.
//
// Each send is one event_notices row, claimed before the email goes, keyed on
// the visit's start time — so it goes once, and a rescheduled visit gets fresh
// reminders (_lib/event-notices.js).
import { sendEmail, brandedEmail, escapeHtml, makeMessageId } from "./email.js";
import { logOutboundEmail } from "./email-log.js";
import { recordActivity } from "./db.js";
import { centralNow } from "./dates.js";
import {
  dueWindows, claimNotice, settleNotice, notYetSent,
  CUSTOMER_VISIT_TYPES, CLOSED_STATUSES, FRESH_BOOKING_HOURS,
} from "./event-notices.js";

const SITE_URL = "https://nationalclosetco.com";
const PHONE = "615-857-5668";
const PHONE_HREF = "tel:+16158575668";

// DB datetimes are stored as LOCAL CENTRAL wall-clock strings with NO timezone
// suffix (see _lib/dates.js) — so read the clock time straight off the string;
// do NOT run it through Date()/timezone conversion (that shifts noon to 7am).
// "2026-08-17T12:00:00" → "12:00 PM".
function fmtTimeCentral(startAt) {
  if (!startAt) return "";
  const time = String(startAt).split(/[T ]/)[1] || "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  if (!Number.isFinite(h)) return "";
  const mn = parseInt(mStr, 10) || 0;
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(mn).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "2026-10-18" → "Sunday, October 18". Parsed and formatted in UTC so a bare
// date never shifts a day.
function fmtDay(iso) {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });
}

const VISIT_LABEL = {
  consultation: "in-home consultation",
  measure: "measure & design visit",
  install: "install",
  service: "service visit",
};

// One reminder for one appointment. `day` is "today" or "tomorrow".
export function renderVisitReminder(a, day) {
  const type = (a.type || "consultation").toLowerCase();
  const label = VISIT_LABEL[type] || VISIT_LABEL.consultation;
  const isDesignVisit = type === "consultation" || type === "measure";
  const first = (a.name || "there").split(" ")[0];
  const time = fmtTimeCentral(a.start_at);
  const at = time ? ` at ${time}` : "";
  const cancelUrl = `${SITE_URL}/book/?cancel=${a.cancel_token || ""}`;

  const subject = `Reminder: your ${label} is ${day}${at}`;
  const lead = isDesignVisit
    ? `Just a friendly reminder that your free ${escapeHtml(label)} with National Closet Company is <strong>${day}${escapeHtml(at)}</strong>.`
    : `Just a friendly reminder that your ${escapeHtml(label)} with National Closet Company is <strong>${day}${escapeHtml(at)}</strong>.`;
  const what = {
    consultation: `<p>We'll take measurements, design a 3D version of the space, and leave you with a quote — no obligation. Plan on about 45–60 minutes.</p>`,
    measure: `<p>We'll take measurements, design a 3D version of the space, and leave you with a quote — no obligation. Plan on about 45–60 minutes.</p>`,
    install: `<p>Before the crew arrives, please clear the space and the area around it, and make sure there is a clear way in for us.</p>`,
    service: "",
  }[type] || "";
  const change = isDesignVisit
    ? `<p>If ${day} no longer works, you can <a href="${cancelUrl}">reschedule or cancel here</a>, or call/text us at <a href="${PHONE_HREF}">${PHONE}</a>.</p>`
    : `<p>If ${day} no longer works, reply to this email or call/text us at <a href="${PHONE_HREF}">${PHONE}</a>.</p>`;

  const html = brandedEmail({
    title: `Your ${label} is ${day}.`,
    preheader: `See you ${day}${at} — National Closet Company.`,
    body: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>${lead}</p>
        ${a.site_address ? `<p>We'll come to:<br/><strong>${escapeHtml(a.site_address)}</strong></p>` : ""}
        ${a.rooms ? `<p><strong>Rooms / scope:</strong> ${escapeHtml(a.rooms)}</p>` : ""}
        ${what}
        ${change}
        <p style="margin-top:24px">See you ${day === "today" ? "soon" : "tomorrow"},<br/>— National Closet Company</p>`,
  });
  const text = `Reminder: your ${label} with National Closet Company is ${day}${at}.\n` +
    (a.site_address ? `\nAddress: ${a.site_address}\n` : "") +
    (type === "install" ? `\nPlease clear the space and the area around it before the crew arrives.\n` : "") +
    (isDesignVisit ? `\nReschedule or cancel: ${cancelUrl}\n` : "\n") +
    `Questions: ${PHONE}\n`;
  return { subject, html, text };
}

async function sendVisitReminder(env, a, when) {
  const day = when === "eve" ? "tomorrow" : "today";
  const { subject, html, text } = renderVisitReminder(a, day);
  const messageId = makeMessageId();
  const res = await sendEmail(env, {
    to: a.name ? `${a.name} <${a.email}>` : a.email,
    subject, html, text, messageId,
  });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to: a.email, subject, html, text, messageId,
    leadId: a.lead_id || null, contactId: a.contact_id || null, projectId: a.project_id || null,
    templateKind: when === "eve" ? "visit_reminder_eve" : "consult_reminder", status: failed ? "failed" : "sent",
  }).catch(() => {});
  return !failed;
}

// The appointments half: every customer visit in today's due windows.
export async function sweepConsultationReminders(env, { now = centralNow() } = {}) {
  const DB = env && env.DB;
  if (!DB) return { reminded: 0 };

  let reminded = 0, skipped = 0;
  for (const w of dueWindows(now)) {
    const notice = `client_${w.when}`;
    const due = (await DB.prepare(
      `SELECT a.id, a.type, a.start_at, a.name, a.email, a.site_address, a.rooms, a.cancel_token,
              a.contact_id, a.project_id, a.lead_id,
              (datetime(a.created_at) > datetime('now', ?4)) AS fresh
         FROM appointments a
        WHERE LOWER(COALESCE(a.type,'consultation')) IN (${CUSTOMER_VISIT_TYPES.map((t) => `'${t}'`).join(",")})
          AND LOWER(COALESCE(a.status,'')) NOT IN (${CLOSED_STATUSES.map((t) => `'${t}'`).join(",")})
          -- start_at is stored in LOCAL CENTRAL time; compare against Central "now".
          AND date(a.start_at) = ?1
          AND (?2 IS NULL OR datetime(a.start_at) > datetime(?2))
          AND ${notYetSent("a", "start_at", "'appointment'", "?3")}
        ORDER BY a.start_at LIMIT 25`
    ).bind(w.date, w.after, notice, `-${FRESH_BOOKING_HOURS} hours`).all()).results || [];

    for (const a of due) {
      if (!(await claimNotice(DB, "appointment", a.id, notice, a.start_at))) continue;
      if (!a.email) { await settleNotice(DB, "appointment", a.id, notice, a.start_at, "skipped:no_email"); continue; }
      if (a.fresh) {
        // Booked within the last few hours: the confirmation is the reminder.
        await settleNotice(DB, "appointment", a.id, notice, a.start_at, "skipped:fresh_booking");
        skipped++;
        continue;
      }
      const ok = await sendVisitReminder(env, a, w.when).catch((e) => {
        console.error("[appointment-reminders] send failed for appointment", a.id, e?.message || e);
        return false;
      });
      await settleNotice(DB, "appointment", a.id, notice, a.start_at, ok ? "sent" : "failed");
      await recordActivity(DB, {
        entityType: "appointment", entityId: a.id,
        action: w.when === "eve" ? "visit-reminder-eve-sent" : "consult-reminder-sent",
        actorKind: "system", actorName: "auto-scheduler",
        details: { to: a.email, start_at: a.start_at, ok },
      }).catch(() => {});
      if (ok) reminded++;
    }
  }
  return { reminded, skipped };
}

// The jobs half: the day before an install date, the customer is reminded to
// clear the space. (The morning of, the "installing" stage email goes instead.)
export async function sendInstallEveReminders(env, { now = centralNow() } = {}) {
  const DB = env && env.DB;
  if (!DB) return { reminded: 0 };
  const eve = dueWindows(now).find((w) => w.when === "eve");
  if (!eve) return { reminded: 0 };

  const due = (await DB.prepare(
    `SELECT p.id, p.install_date, p.lead_id, p.contact_id, c.name AS contact_name, c.email AS contact_email,
            EXISTS (SELECT 1 FROM email_messages m
                     WHERE m.project_id = p.id AND m.template_kind = 'job_scheduled' AND m.direction = 'out'
                       AND datetime(m.created_at) > datetime('now', ?2)) AS fresh
       FROM projects p JOIN contacts c ON c.id = p.contact_id
      WHERE p.status = 'scheduled_install'
        AND p.install_date = ?1
        AND ${notYetSent("p", "install_date", "'project'", "'client_eve'")}
      ORDER BY p.id LIMIT 25`
  ).bind(eve.date, `-${FRESH_BOOKING_HOURS} hours`).all().catch(() => ({ results: [] }))).results || [];

  let reminded = 0;
  for (const p of due) {
    if (!(await claimNotice(DB, "project", p.id, "client_eve", p.install_date))) continue;
    if (!p.contact_email) { await settleNotice(DB, "project", p.id, "client_eve", p.install_date, "skipped:no_email"); continue; }
    // The "install is scheduled" email went out within the last few hours.
    if (p.fresh) { await settleNotice(DB, "project", p.id, "client_eve", p.install_date, "skipped:fresh_booking"); continue; }

    const first = (p.contact_name || "there").trim().split(/\s+/)[0];
    const day = fmtDay(p.install_date);
    const subject = `Reminder: your install is tomorrow, ${day}`;
    const html = brandedEmail({
      title: "Your install is tomorrow.",
      preheader: `Our team installs your project tomorrow, ${day}.`,
      body: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>A reminder that our team is installing your project <strong>tomorrow, ${escapeHtml(day)}</strong>.</p>
        <p>Before the crew arrives, please clear the space and the area around it, and make sure there is a clear way in for us.</p>
        <p>If anything has changed, reply to this email or call/text us at <a href="${PHONE_HREF}">${PHONE}</a>.</p>
        <p style="margin-top:24px">See you tomorrow,<br/>— National Closet Company</p>`,
    });
    const text = `Reminder: National Closet Company is installing your project tomorrow, ${day}.\n\n` +
      `Please clear the space and the area around it before the crew arrives.\n\n` +
      `If anything has changed, reply to this email or call/text ${PHONE}.\n`;
    const to = p.contact_name ? `${p.contact_name} <${p.contact_email}>` : p.contact_email;
    const messageId = makeMessageId();
    const res = await sendEmail(env, { to, subject, html, text, messageId }).catch((e) => ({ error: String(e) }));
    const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
    await logOutboundEmail(env, {
      to, subject, html, text, messageId,
      projectId: p.id, contactId: p.contact_id, leadId: p.lead_id || null,
      templateKind: "install_reminder_eve", status: failed ? "failed" : "sent",
    }).catch(() => {});
    await settleNotice(DB, "project", p.id, "client_eve", p.install_date, failed ? "failed" : "sent");
    await recordActivity(DB, {
      entityType: "project", entityId: p.id, action: "install-reminder-eve-sent",
      actorKind: "system", actorName: "auto-scheduler",
      details: { to: p.contact_email, install_date: p.install_date, ok: !failed },
    }).catch(() => {});
    if (!failed) reminded++;
  }
  return { reminded };
}
