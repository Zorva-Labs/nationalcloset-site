// The team's email for a website lead (/api/contact), and the follow-up when the
// customer adds details on the form's second step (/api/contact-address).
//
// The form asks for a name and a phone number only, so the first alert usually
// carries nothing else. It used to print every field anyway: "(not given)",
// "(not specified)", "(no message)", and an empty address that rendered as a
// lone ", " linked to Google Maps. That read as a bot submission (2026-09-30,
// Catherine O'Mara), and what she typed a moment later (email, space, address,
// a note) was saved to the CRM but never emailed. Now each alert lists only the
// fields it has, and the second step sends its details as a reply in the same
// Gmail thread (the first alert's Message-ID is derived from the lead id).

import { escapeHtml as esc } from "./email.js";

const CRM = "https://nationalclosetco.com/crm/";
const LINK = "color: #D2683F;";
const BTN = "display: inline-block; padding: 10px 18px; text-decoration: none; font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; border-radius: 6px;";

// Stable per lead, so the follow-up can thread under the first alert.
export const leadAlertMessageId = (leadId) => `<lead-${leadId}.alert@nationalclosetco.com>`;
export const leadAlertSubject = (name) => `New consultation request — ${name}`;
export const leadUrl = (leadId) => (leadId ? `${CRM}lead.html?id=${leadId}` : CRM);

// "123 Main St" + "Nashville, TN 37203" — only the parts that were given.
export function addressLines({ street, city, state, zip }) {
  const second = [[city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  return [street, second].filter(Boolean);
}

// Rows the customer actually filled in, as [label, text, html] (html optional).
export function leadRows({ name, phone, email, street, city, state, zip, interest }) {
  const rows = [];
  if (name) rows.push(["Name", name, `<strong>${esc(name)}</strong>`]);
  if (phone) rows.push(["Phone", phone, `<a href="tel:${esc(phone)}" style="${LINK}">${esc(phone)}</a>`]);
  if (email) rows.push(["Email", email, `<a href="mailto:${esc(email)}" style="${LINK}">${esc(email)}</a>`]);
  const addr = addressLines({ street, city, state, zip });
  if (addr.length) {
    const q = encodeURIComponent(addr.join(", "));
    rows.push(["Address", addr.join("\n             "),
      `<a href="https://www.google.com/maps/search/?api=1&query=${q}" style="${LINK}">${addr.map(esc).join("<br/>")}</a>`]);
  }
  if (interest) rows.push(["Space", interest, esc(interest)]);
  return rows;
}

// Plain text and HTML for one alert. `intro` is a sentence above the fields,
// `note` a line under them (both plain text).
export function renderLeadAlert({ heading, kicker, intro, rows, message, email, name, leadId, note }) {
  const text = [
    intro, "",
    ...rows.map(([label, t]) => `${(label + ":").padEnd(13)}${t}`),
    ...(message ? ["", "Message:", message] : []),
    ...(note ? ["", note] : []),
    "",
    email ? `Reply to the customer: ${email}` : "No email yet — text or call the number above.",
    "",
    "View this lead in the CRM:",
    leadUrl(leadId),
    "",
  ].join("\n");

  const html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #16140F; max-width: 600px; line-height: 1.55;">
  <h2 style="font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; font-weight: 400; font-size: 26px; margin: 0 0 8px;">${esc(heading)}</h2>
  <p style="margin: 0 0 12px; font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #D2683F;">${esc(kicker)}</p>
  <p style="margin: 0 0 16px; color: #3A362F;">${esc(intro)}</p>
  <table style="border-collapse: collapse; width: 100%; margin: 0 0 24px;">
    ${rows.map(([label, _t, h]) => `<tr><td style="padding: 8px 12px 8px 0; color: #3A362F; width: 130px; vertical-align: top;">${esc(label)}</td><td style="padding: 8px 0;">${h}</td></tr>`).join("\n    ")}
  </table>
  ${message ? `<p style="margin: 0 0 8px; color: #3A362F;">Message:</p>
  <div style="background: #FAF9F6; border-left: 2px solid #D2683F; padding: 14px 18px; white-space: pre-wrap;">${esc(message)}</div>` : ""}
  ${note ? `<p style="margin: 20px 0 0; color: #3A362F;">${esc(note)}</p>` : ""}
  ${email ? `<p style="margin: 28px 0 0;"><a href="mailto:${esc(email)}?subject=${encodeURIComponent("Re: your closet consultation request — National Closet Company")}" style="${BTN} background: #D2683F; color: #FAF9F6; font-size: 13px; font-weight: 700;">Reply to ${esc(name)}</a></p>` : ""}
  <p style="margin: 28px 0 0;"><a href="${leadUrl(leadId)}" style="${BTN} background: #16140F; color: #FAF9F6; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase;">Open in CRM →</a></p>
  <p style="margin: 28px 0 0; font-size: 12px; color: #8B7F6F;">Sent from the National Closet Company website. This lead has been saved to the CRM automatically.</p>
</div>`;
  return { text, html };
}
