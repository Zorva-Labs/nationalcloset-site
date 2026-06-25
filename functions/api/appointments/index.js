// /api/appointments — admin list + admin manual create
import { requireAuth, json } from "../../_lib/auth.js";
import { genToken } from "../../_lib/tokens.js";
import { recordActivity, upsertContact } from "../../_lib/db.js";
import { bumpLeadStatusForward } from "../../_lib/lifecycle.js";
import { sendEmail, brandedEmail, escapeHtml, makeMessageId } from "../../_lib/email.js";
import { buildIcs } from "../../_lib/ical.js";
import { fmtPretty } from "../../_lib/dates.js";
import { logOutboundEmail } from "../../_lib/email-log.js";

const SITE_URL = "https://nationalclosetco.com";

export async function onRequestGet(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const from = url.searchParams.get("from") || "1900-01-01";
  const to = url.searchParams.get("to") || "2999-12-31";
  const status = url.searchParams.get("status");

  let sql = `SELECT a.*, c.name AS contact_name FROM appointments a
             LEFT JOIN contacts c ON c.id = a.contact_id
             WHERE a.start_at >= ?1 AND a.start_at <= ?2`;
  const binds = [from + "T00:00:00", to + "T23:59:59"];
  if (status) { sql += ` AND a.status = ?3`; binds.push(status); }
  sql += ` ORDER BY a.start_at ASC LIMIT 500`;
  const rows = (await DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ appointments: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const body = await context.request.json().catch(() => ({}));
  const required = ["start_at", "end_at", "name", "email"];
  for (const k of required) {
    if (!body[k]) return json({ error: `Missing ${k}` }, 400);
  }
  const contactId = await upsertContact(DB, {
    name: body.name, email: body.email, phone: body.phone,
    address: body.address || null,
  });
  const cancelToken = genToken(16);
  const r = await DB
    .prepare(
      `INSERT INTO appointments (contact_id, lead_id, project_id, type, start_at, end_at, duration_min, status, source,
        name, email, phone, site_address, rooms, notes, cancel_token)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       RETURNING id`
    )
    .bind(
      contactId,
      body.lead_id || null,
      body.project_id || null,
      body.type || "consultation",
      body.start_at,
      body.end_at,
      body.duration_min || 60,
      body.status || "confirmed",
      body.source || "admin",
      body.name,
      body.email,
      body.phone || null,
      body.site_address || null,
      body.rooms || null,
      body.notes || null,
      cancelToken,
    )
    .first();
  // Auto-advance any lead this appointment is for to "consult". Two ways the
  // caller may identify the lead: body.lead_id (preferred — passed when
  // booking from the lead page) or a match on body.email (so anyone scheduling
  // a consult by email still bumps the right lead even without explicit FK).
  let leadIdForBump = body.lead_id || null;
  if (!leadIdForBump && body.email) {
    const lead = await DB.prepare(`SELECT id FROM leads WHERE LOWER(email)=?1 ORDER BY id DESC LIMIT 1`).bind(body.email.toLowerCase()).first().catch(() => null);
    if (lead) leadIdForBump = lead.id;
  }
  if (leadIdForBump && (body.type || "consultation") === "consultation") {
    await bumpLeadStatusForward(DB, leadIdForBump, "consult", { actor: { kind: "admin", id: auth.id, name: auth.email } });
  }

  await recordActivity(DB, {
    entityType: "appointment", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { lead_id: leadIdForBump, type: body.type || "consultation" },
  });

  // Email the client their appointment details (consultation / measure visits).
  // Best-effort — never blocks the booking response. Logged to the client's CRM
  // timeline so the conversation is captured from the first touch.
  const apptType = (body.type || "consultation").toLowerCase();
  if (["consultation", "measure"].includes(apptType) && body.email) {
    const isMeasure = apptType === "measure";
    const visitLabel = isMeasure ? "measure & design visit" : "in-home consultation";
    const when = fmtPretty(body.start_at);
    const address = body.site_address || null;
    const first = (body.name || "there").split(" ")[0];
    const cancelUrl = `${SITE_URL}/book/?cancel=${cancelToken}`;
    const subject = `Your ${visitLabel} is confirmed — ${when}`;
    const html = brandedEmail({
      title: "You're confirmed.",
      preheader: `${visitLabel} on ${when}.`,
      body: `
        <p>Hi ${escapeHtml(first)},</p>
        <p>Your free ${escapeHtml(visitLabel)} with National Closet Company is booked for:</p>
        <p style="font-size:18px;color:#16140F;font-weight:600;margin:14px 0">${escapeHtml(when)}</p>
        ${address ? `<p>We'll come to:<br/><strong>${escapeHtml(address)}</strong></p>` : ""}
        ${body.rooms ? `<p><strong>Rooms / scope:</strong> ${escapeHtml(body.rooms)}</p>` : ""}
        ${body.notes ? `<p><strong>Notes:</strong> ${escapeHtml(body.notes)}</p>` : ""}
        <p>We'll bring samples, take measurements, and leave you with a written quote on the visit — no obligation.</p>
        <p>If anything changes, you can <a href="${cancelUrl}">reschedule or cancel here</a>, or call/text us at <a href="tel:+16292988241">629-298-8241</a>.</p>
        <p style="margin-top:24px">Looking forward to meeting you,<br/>— National Closet Company</p>`,
    });
    const text = `Your ${visitLabel} is confirmed for ${when}.\n\n` +
      (address ? `We'll come to:\n${address}\n\n` : "") +
      (body.rooms ? `Rooms/scope: ${body.rooms}\n\n` : "") +
      `Reschedule/cancel: ${cancelUrl}\nQuestions: 629-298-8241\n`;
    const ics = buildIcs({
      uid: `appt-${r.id}@nationalclosetco.com`,
      start: body.start_at, end: body.end_at,
      summary: `National Closet Company · ${isMeasure ? "Measure & Design" : "In-Home Consultation"}`,
      description: `Your ${visitLabel} with National Closet Company.\\n\\nQuestions? Call 629-298-8241.\\n\\nReschedule or cancel: ${cancelUrl}`,
      location: address || "Your home",
      organizer: "hello@nationalclosetco.com", organizerName: "National Closet Company",
      url: cancelUrl,
    });
    const messageId = makeMessageId();
    const work = (async () => {
      const res = await sendEmail(context.env, {
        to: body.name ? `${body.name} <${body.email}>` : body.email,
        subject, html, text, messageId,
        attachments: [{ filename: "ncc-consultation.ics", contentType: "text/calendar; method=REQUEST", content: utf8ToBase64(ics) }],
      });
      const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
      await logOutboundEmail(context.env, {
        to: body.email, subject, html, text, messageId,
        leadId: leadIdForBump, contactId, templateKind: "consult_confirm",
        status: failed ? "failed" : "sent",
      });
    })().catch((e) => console.error("[appointments] consult email failed:", e?.message || e));
    if (context.waitUntil) context.waitUntil(work); else await work;
  }

  return json({ id: r.id, cancel_token: cancelToken });
}

// UTF-8-safe base64 for the iCal attachment (btoa() only handles Latin1, so
// em-dashes / smart quotes / accents would otherwise throw).
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
