// Shared consultation/measure confirmation email — used both when an admin
// books an appointment (appointments POST) and when they resend it later
// (appointments/[id] POST { action: "send_confirmation" }).
import { sendEmail, brandedEmail, escapeHtml, makeMessageId } from "./email.js";
import { buildIcs } from "./ical.js";
import { fmtPretty } from "./dates.js";
import { logOutboundEmail } from "./email-log.js";

const SITE_URL = "https://nationalclosetco.com";

// Which appointment types get a client-facing confirmation.
export function isClientVisit(type) {
  return ["consultation", "measure"].includes((type || "consultation").toLowerCase());
}

// Build + send + log the confirmation. `appt` needs: id, type, start_at, end_at,
// name, email, site_address, rooms, notes, cancel_token. Returns the sendEmail
// result ({ status } on success, { skipped|error } on failure).
export async function sendAppointmentConfirmation(env, appt, { leadId = null, contactId = null } = {}) {
  if (!appt || !appt.email) return { skipped: true, reason: "no_email" };
  const isMeasure = (appt.type || "consultation").toLowerCase() === "measure";
  const visitLabel = isMeasure ? "measure & design visit" : "in-home consultation";
  const when = fmtPretty(appt.start_at);
  const address = appt.site_address || null;
  const first = (appt.name || "there").split(" ")[0];
  const cancelUrl = `${SITE_URL}/book/?cancel=${appt.cancel_token || ""}`;
  const subject = `Your ${visitLabel} is confirmed — ${when}`;

  const html = brandedEmail({
    title: "You're confirmed.",
    preheader: `${visitLabel} on ${when}.`,
    body: `
      <p>Hi ${escapeHtml(first)},</p>
      <p>Your free ${escapeHtml(visitLabel)} with National Closet Company is booked for:</p>
      <p style="font-size:18px;color:#16140F;font-weight:600;margin:14px 0">${escapeHtml(when)}</p>
      ${address ? `<p>We'll come to:<br/><strong>${escapeHtml(address)}</strong></p>` : ""}
      ${appt.rooms ? `<p><strong>Rooms / scope:</strong> ${escapeHtml(appt.rooms)}</p>` : ""}
      ${appt.notes ? `<p><strong>Notes:</strong> ${escapeHtml(appt.notes)}</p>` : ""}
      <p>We'll bring samples, take measurements, and leave you with a written quote on the visit — no obligation.</p>
      <p>If anything changes, you can <a href="${cancelUrl}">reschedule or cancel here</a>, or call/text us at <a href="tel:+16292988241">629-298-8241</a>.</p>
      <p style="margin-top:24px">Looking forward to meeting you,<br/>— National Closet Company</p>`,
  });
  const text = `Your ${visitLabel} is confirmed for ${when}.\n\n` +
    (address ? `We'll come to:\n${address}\n\n` : "") +
    (appt.rooms ? `Rooms/scope: ${appt.rooms}\n\n` : "") +
    `Reschedule/cancel: ${cancelUrl}\nQuestions: 629-298-8241\n`;
  const ics = buildIcs({
    uid: `appt-${appt.id}@nationalclosetco.com`,
    start: appt.start_at, end: appt.end_at,
    summary: `National Closet Company · ${isMeasure ? "Measure & Design" : "In-Home Consultation"}`,
    description: `Your ${visitLabel} with National Closet Company.\\n\\nQuestions? Call 629-298-8241.\\n\\nReschedule or cancel: ${cancelUrl}`,
    location: address || "Your home",
    organizer: "hello@nationalclosetco.com", organizerName: "National Closet Company",
    url: cancelUrl,
  });
  const messageId = makeMessageId();
  const res = await sendEmail(env, {
    to: appt.name ? `${appt.name} <${appt.email}>` : appt.email,
    subject, html, text, messageId,
    attachments: [{ filename: "ncc-consultation.ics", contentType: "text/calendar; method=REQUEST", content: utf8ToBase64(ics) }],
  });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to: appt.email, subject, html, text, messageId,
    leadId, contactId, templateKind: "consult_confirm", status: failed ? "failed" : "sent",
  }).catch(() => {});
  return res;
}

// UTF-8-safe base64 for the iCal attachment (btoa() only handles Latin1).
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
