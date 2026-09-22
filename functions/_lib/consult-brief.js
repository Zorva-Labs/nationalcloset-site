// The consult brief — everything the person going out needs, emailed to the
// team member(s) assigned to the visit on the morning of the visit.
//
// Client name, phone, email, address (linked to Google Maps), rooms, notes and
// the time, plus a link back to the consult in the CRM. One email per assignee
// so it is addressed to them personally and a reply goes somewhere sensible.
//
// The wording lives in email_templates (kind 'consult_brief') so the owner can
// edit it in the CRM; FALLBACK below is a byte-for-byte copy of the seeded row
// so a deleted or deactivated template can never silence the morning email.
//
// Deliberately NOT logged to email_messages: that table is the conversation
// with the CLIENT, and a crew brief they never received does not belong in it.
// The record is an activity_log entry on the appointment instead.
import { sendEmail, brandedEmail, escapeHtml, makeMessageId, alertSender } from "./email.js";
import { renderTemplate } from "./email-vars.js";
import { recordActivity } from "./db.js";
import { getAssignees, listTeam, nameList } from "./team.js";

const SITE_URL = "https://nationalclosetco.com";
const DASH = "—";

// ── Central time ─────────────────────────────────────────────────────
// Every datetime in this CRM is a naive CENTRAL wall-clock string. Use the IANA
// zone, not a fixed -5: Central is UTC-6 in winter, and a flat offset reports
// the wrong date for the first hour of every daylight-saving day.
export function centralNow() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago", hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date()).filter((x) => x.type !== "literal").map((x) => [x.type, x.value])
  );
  // hourCycle h23 still renders midnight as "24" in some ICU builds.
  const hour = parseInt(p.hour, 10) % 24;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    iso: `${p.year}-${p.month}-${p.day}T${String(hour).padStart(2, "0")}:${p.minute}:${p.second}`,
  };
}

// "2026-09-22T14:30:00" → "2:30 PM". Read the clock straight off the string —
// running it through Date() would shift it by the runtime's offset.
export function fmtTime(startAt) {
  const time = String(startAt || "").split(/[T ]/)[1] || "";
  const [hStr, mStr] = time.split(":");
  const h = parseInt(hStr, 10);
  if (!Number.isFinite(h)) return "";
  const mn = parseInt(mStr, 10) || 0;
  return `${((h + 11) % 12) + 1}:${String(mn).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

// "2026-09-22T14:30:00" → "Tuesday, September 22"
export function fmtDay(startAt) {
  const [Y, Mo, D] = String(startAt || "").slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (!Y || !Mo || !D) return "";
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${weekdays[new Date(Date.UTC(Y, Mo - 1, D)).getUTCDay()]}, ${months[Mo - 1]} ${D}`;
}

// How the visit's day reads relative to the day the brief is sent. The sweep
// only ever sends on the day itself, but "Send crew brief" in the calendar can
// go out days early — a Tuesday send for a Friday visit must not say "Today".
//   day_word     "Today" | "Tomorrow" | "Friday" | "Friday, October 2"
//   day_relative "today" | "tomorrow" | "on Friday" | "on Friday, October 2"
export function dayWords(startAt, todayIso) {
  const day = String(startAt || "").slice(0, 10);
  const today = String(todayIso || "").slice(0, 10);
  const toUtc = (d) => { const [Y, M, D] = d.split("-").map(Number); return Date.UTC(Y, M - 1, D); };
  const full = fmtDay(startAt);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{4}-\d{2}-\d{2}$/.test(today) || !full) {
    return { day_word: full || DASH, day_relative: full ? `on ${full}` : "" };
  }
  const diff = Math.round((toUtc(day) - toUtc(today)) / 86400000);
  if (diff === 0) return { day_word: "Today", day_relative: "today" };
  if (diff === 1) return { day_word: "Tomorrow", day_relative: "tomorrow" };
  const weekday = full.split(",")[0];
  const word = diff > 1 && diff < 7 ? weekday : full;
  return { day_word: word, day_relative: `on ${word}` };
}

// "Morning" is only true before noon Central.
export function greetingWord(hour) {
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

// "(629) 298-8241" → "+16292988241" for the tel: href. Anything that isn't a
// US 10/11-digit number is passed through with its punctuation stripped.
function telHref(phone) {
  const digits = String(phone || "").replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) return `+1${digits}`;
  if (/^1\d{10}$/.test(digits)) return `+${digits}`;
  return digits;
}

function mapsLink(address) {
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "https://www.google.com/maps";
}

// The city out of an address, for the subject line — the one thing that tells
// two of today's visits apart at a glance. Addresses reach us in several
// shapes: "123 Oak St, Franklin, TN 37064" (the booking form), "123 Oak St,
// Franklin, TN, 37064" (assembled from the contact record's four columns), and
// "123 Oak St, Franklin TN 37064". Trailing state and ZIP fragments are dropped
// and whatever is then last is the city.
function shortPlace(address) {
  const parts = String(address || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "no address on file";
  const ZIP = String.raw`\d{5}(?:-\d{4})?`;
  const trailing = new RegExp(`^(?:${ZIP}|[A-Za-z]{2}(?:\\s+${ZIP})?)$`);
  const kept = [...parts];
  while (kept.length > 1 && trailing.test(kept[kept.length - 1])) kept.pop();
  const last = kept[kept.length - 1];
  // "Franklin TN 37064" / "Franklin 37064" — state and ZIP without a comma.
  return last
    .replace(new RegExp(`\\s+(?:[A-Za-z]{2}\\s+)?${ZIP}$`), "")
    .replace(/\s+[A-Za-z]{2}$/, "")
    .trim() || last;
}

export function visitLabel(type) {
  return (type || "consultation").toLowerCase() === "measure" ? "measure & design visit" : "in-home consultation";
}

// The appointment's site address, falling back to the contact record — a
// consult booked from the lead page often has the address only on the contact.
async function resolveAddress(db, appt) {
  if (appt.site_address) return appt.site_address;
  if (!appt.contact_id) return "";
  const c = await db.prepare(
    `SELECT address_street, address_city, address_state, address_zip FROM contacts WHERE id=?1`
  ).bind(appt.contact_id).first().catch(() => null);
  if (!c) return "";
  const cityState = [c.address_city, c.address_state].filter(Boolean).join(", ");
  return [c.address_street, cityState, c.address_zip].filter(Boolean).join(", ");
}

async function loadTemplate(db) {
  const row = await db.prepare(
    `SELECT * FROM email_templates WHERE kind='consult_brief' AND is_active=1
      ORDER BY is_default DESC, id LIMIT 1`
  ).first().catch(() => null);
  return row || FALLBACK;
}

// Who gets the brief. The assignees — and when nobody has been assigned, the
// whole active roster, because a visit happening in three hours that nobody
// was assigned to is exactly the one that must not go out unannounced.
export async function briefRecipients(db, appointmentId) {
  const assigned = await getAssignees(db, "appointment", appointmentId);
  const active = assigned.filter((m) => m.active !== 0);
  if (active.length) return { recipients: active, assigned: true };
  return { recipients: await listTeam(db), assigned: false };
}

// Everything the brief needs, resolved once per appointment: who it goes to,
// the wording, and the merge values. Split out from the send so the rendered
// email can be inspected without a mail transport.
export async function briefContext(db, appt) {
  const { recipients, assigned } = await briefRecipients(db, appt.id);
  const tpl = await loadTemplate(db);
  const address = await resolveAddress(db, appt);
  const now = centralNow();
  const going = assigned
    ? nameList(recipients)
    : `Nobody assigned yet — ${nameList(recipients)} all got this`;

  return {
    recipients, assigned, tpl,
    vars: {
      visit_type: visitLabel(appt.type),
      client_name: appt.name || DASH,
      client_phone: appt.phone || "No phone on file",
      client_phone_href: telHref(appt.phone) || "",
      client_email: appt.email || "No email on file",
      appointment_date: fmtDay(appt.start_at) || DASH,
      ...dayWords(appt.start_at, now.date),
      greeting: greetingWord(now.hour),
      appointment_time: fmtTime(appt.start_at) || DASH,
      duration: `${appt.duration_min || 60} min`,
      address: address || "No address on file",
      city_or_address: shortPlace(address),
      maps_link: mapsLink(address),
      rooms: appt.rooms || DASH,
      notes: appt.notes || DASH,
      team_list: going,
      crm_link: `${SITE_URL}/crm/calendar.html?appt=${appt.id}`,
    },
  };
}

// A token the template asks for that we do not supply is blanked, not delivered
// literally. renderTemplate leaves "{{foo}}" visible on purpose — that is right
// for customer mail, where a half-filled sentence should be caught before it is
// sent, but this one sends itself at 7am with nobody reading it first. The
// warning makes a typo in an edited template visible in the Worker log.
function stripUnfilled(s, where) {
  return String(s).replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi, (_m, k) => {
    console.warn(`[consult-brief] no value for {{${k}}} in the ${where} — left blank`);
    return "";
  });
}

// The brief as one team member receives it.
export function renderBrief(tpl, vars, member) {
  const first = String(member?.name || "").trim().split(/\s+/)[0] || "team";
  const all = { ...vars, team_first_name: first };
  // renderTemplate substitutes raw, so anything landing in HTML is escaped
  // first — a client note containing "<" would otherwise break the layout.
  const htmlVars = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, escapeHtml(v)]));

  const subject = stripUnfilled(renderTemplate(tpl.subject || FALLBACK.subject, all), "subject");
  const text = stripUnfilled(renderTemplate(tpl.body_text || FALLBACK.body_text, all), "plain-text body");
  const html = brandedEmail({
    title: `${all.day_word} ${all.appointment_time} · ${all.client_name}`,
    preheader: `${all.visit_type} at ${all.appointment_time} — ${all.city_or_address}.`,
    body: stripUnfilled(renderTemplate(tpl.body_html || FALLBACK.body_html, htmlVars), "HTML body"),
    signature: false,
    footer: "National Closet Company CRM · internal crew brief · do not forward to the client",
  });
  return { subject, html, text };
}

// Build + send the brief for one appointment. Returns { sent, failed, to: [] }.
// Never throws.
export async function sendConsultBrief(env, appt, { actor = {} } = {}) {
  const db = env.DB;
  const { recipients, assigned, tpl, vars } = await briefContext(db, appt);
  if (!recipients.length) return { sent: 0, failed: 0, to: [], reason: "no_team_members" };

  const sender = alertSender(env);
  let sent = 0, failed = 0;
  const to = [];
  for (const member of recipients) {
    const { subject, html, text } = renderBrief(tpl, vars, member);
    const res = await sendEmail(env, {
      from: `National Closet Co. CRM <${sender}>`,
      sendAs: sender,
      to: member.name ? `${member.name} <${member.email}>` : member.email,
      subject, html, text, messageId: makeMessageId(),
    });
    const bad = res?.skipped || res?.error || (res?.status && res.status >= 400);
    if (bad) {
      failed++;
      console.error("[consult-brief] send failed:", member.email, res?.error || res?.reason || res?.status);
    } else {
      sent++;
      to.push(member.email);
    }
  }

  await recordActivity(db, {
    entityType: "appointment", entityId: appt.id,
    action: sent ? "consult-brief-sent" : "consult-brief-failed",
    actorKind: actor.kind || "system", actorId: actor.id || null,
    actorName: actor.name || "auto-scheduler",
    details: { to, failed, assigned, start_at: appt.start_at },
  }).catch(() => {});

  return { sent, failed, to, assigned };
}

// ── Morning-of sweep ─────────────────────────────────────────────────
// Idempotent: safe on every cron tick. For each client visit happening later
// TODAY in Central Time, once it is past 7am Central, email the assigned team
// member(s) their brief and stamp team_brief_sent_at so it goes out once.
export async function sweepConsultBriefs(env) {
  const db = env && env.DB;
  if (!db) return { briefed: 0 };
  const now = centralNow();
  if (now.hour < 7) return { briefed: 0, skipped: "before_7am" };

  const due = (await db.prepare(
    `SELECT id, type, start_at, end_at, duration_min, name, email, phone, site_address, rooms, notes,
            contact_id, project_id, lead_id
       FROM appointments
      WHERE LOWER(COALESCE(type,'consultation')) IN ('consultation','measure')
        AND LOWER(COALESCE(status,'')) NOT IN ('canceled','cancelled','no_show','no-show','completed','done')
        AND team_brief_sent_at IS NULL
        AND date(start_at) = ?1
        AND start_at > ?2
      ORDER BY start_at LIMIT 25`
  ).bind(now.date, now.iso).all().catch(() => ({ results: [] }))).results || [];

  let briefed = 0, people = 0;
  for (const appt of due) {
    // Stamp first: a send that hangs mid-loop must not double-send next tick.
    await db.prepare(
      `UPDATE appointments SET team_brief_sent_at=datetime('now'), updated_at=datetime('now') WHERE id=?1`
    ).bind(appt.id).run();
    const r = await sendConsultBrief(env, appt).catch((e) => {
      console.error("[consult-brief] sweep failed for appointment", appt.id, e?.message || e);
      return { sent: 0 };
    });
    if (r.sent) { briefed++; people += r.sent; }
  }
  return { briefed, people };
}

// The seeded template, duplicated here so the sweep still sends when the D1 row
// is missing. Keep in sync with crm/migrations/0070_team_assignments.sql
// as amended by 0071_consult_brief_day_words.sql.
const FALLBACK = {
  id: null,
  subject: "{{day_word}} {{appointment_time}}: {{client_name}} — {{city_or_address}}",
  body_text: `{{greeting}} {{team_first_name}},

Your {{visit_type}} is {{day_relative}} at {{appointment_time}}.

CLIENT     {{client_name}}
PHONE      {{client_phone}}
EMAIL      {{client_email}}
WHEN       {{appointment_date}} at {{appointment_time}} ({{duration}})
ADDRESS    {{address}}
DIRECTIONS {{maps_link}}
ROOMS      {{rooms}}
NOTES      {{notes}}
GOING      {{team_list}}

Open the consult in the CRM: {{crm_link}}

Call or text the client if you are running late — {{client_phone}}.`,
  body_html: `<p style="margin:0 0 14px">{{greeting}} {{team_first_name}},</p>
<p style="margin:0 0 4px">Your <strong>{{visit_type}}</strong> is {{day_relative}} at <strong>{{appointment_time}}</strong>. Everything you need is below.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:20px 0 6px;font-size:15px">
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;width:104px;vertical-align:top">Client</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F;font-weight:700">{{client_name}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Phone</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="tel:{{client_phone_href}}" style="color:#D2683F;text-decoration:none;font-weight:700">{{client_phone}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Email</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="mailto:{{client_email}}" style="color:#D2683F;text-decoration:none">{{client_email}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">When</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{appointment_date}} at <strong>{{appointment_time}}</strong> &middot; {{duration}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Address</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC"><a href="{{maps_link}}" style="color:#D2683F;text-decoration:none;font-weight:700">{{address}}</a></td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Rooms</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{rooms}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Notes</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{notes}}</td></tr>
  <tr><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#6C665B;vertical-align:top">Going</td><td style="padding:10px 0;border-bottom:1px solid #E3E1DC;color:#16140F">{{team_list}}</td></tr>
</table>
<p style="margin:22px 0 6px"><a href="{{maps_link}}" style="display:inline-block;background:#D2683F;color:#ffffff;text-decoration:none;padding:14px 26px;font-size:14px;font-weight:700;border-radius:6px;font-family:'Montserrat','Helvetica Neue',Arial,sans-serif">Open in Google Maps</a></p>
<p style="margin:14px 0 0;font-size:13px;color:#6C665B">Running late? Call or text {{client_name}} at <a href="tel:{{client_phone_href}}" style="color:#D2683F;text-decoration:none">{{client_phone}}</a>. &nbsp;<a href="{{crm_link}}" style="color:#D2683F;text-decoration:none">Open in the CRM &rarr;</a></p>`,
};
