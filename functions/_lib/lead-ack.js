// The branded "thanks for reaching out" email a new lead gets, logged to the
// CRM so the lead's timeline shows the conversation from the first touch.
// Shared by /api/contact (when the form carries an email) and by
// /api/contact-address (when the email arrives in the optional second step).
import { sendEmail, brandedEmail, escapeHtml, makeMessageId } from "./email.js";
import { logOutboundEmail } from "./email-log.js";

const SITE_URL = "https://nationalclosetco.com";

export async function sendLeadAck(env, { name, email, interest, leadId = null, contactId = null }) {
  if (!email) return { skipped: true, reason: "no_email" };
  const first = (name || "there").trim().split(/\s+/)[0] || "there";
  const about = interest ? ` about your ${String(interest).toLowerCase()}` : "";
  const subject = `Thanks for reaching out to National Closet Company, ${first}`;
  const html = brandedEmail({
    title: "Thanks for reaching out!",
    preheader: "A designer will text or call within one business day — or pick your visit time now.",
    body: `
      <p>Hi ${escapeHtml(first)},</p>
      <p>Thank you for contacting National Closet Company${escapeHtml(about)}. We've received your request, and a member of our family-owned team will text or call within one business day to set up your free in-home design.</p>
      <p>Want to lock in a time now? <a href="${SITE_URL}/book/">Pick your free design visit here</a> — it takes about a minute.</p>
      <p>If you'd like to talk sooner, just call or text us at <strong>629-298-8241</strong>.</p>
      <p>We look forward to helping you build a beautiful custom space at a price that makes sense.</p>
      <p>Warmly,<br>Michael Blair<br>National Closet Company</p>`,
    signature: false,
  });
  const text =
`Hi ${first},

Thank you for contacting National Closet Company${about}. We've received your request, and a member of our family-owned team will text or call within one business day to set up your free in-home design.

Want to lock in a time now? Pick your free design visit here: ${SITE_URL}/book/

If you'd like to talk sooner, just call or text us at 629-298-8241.

Warmly,
Michael Blair
National Closet Company
`;
  const messageId = makeMessageId();
  const to = name ? `${name} <${email}>` : email;
  const res = await sendEmail(env, { to, subject, html, text, messageId });
  const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
  await logOutboundEmail(env, {
    to, subject, html, text, messageId,
    leadId, contactId, templateKind: "lead_ack", status: failed ? "failed" : "sent",
  }).catch(() => {});
  return res;
}
