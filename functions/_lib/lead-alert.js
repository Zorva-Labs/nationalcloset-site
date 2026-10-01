// The staff alert for a website lead, sent as crm@ to hello@ (sendStaffAlert).
//
// The form asks for a name and a phone number only; email, the space, the
// address and a note arrive later, if at all, on the optional details step
// (/api/contact-address). So the alert lists only the fields the customer
// actually gave: an alert that printed every field ("Email: (not given)",
// "Address: ,", "Considering: (not specified)", "(no message)") read like a
// spam submission, and staff took real leads for junk (2026-10-01).
//
// The details step sends a second alert with everything known by then, in the
// same Gmail thread: same subject, and In-Reply-To/References pointing at the
// first alert's Message-ID, which is derived from the lead id.
import { sendStaffAlert } from "./email.js";

const CRM_URL = "https://nationalclosetco.com/crm/";
const alertMessageId = (leadId) => `<lead-${leadId}.alert@nationalclosetco.com>`;

const esc = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// "website" → "Home page"; "website/free-design" → "/free-design".
function sourceLabel(source) {
  const s = String(source || "");
  if (s === "website" || s === "website/") return "Home page";
  if (s.startsWith("website/")) return s.slice("website".length);
  return s || "";
}

// One line per address part that exists, never a stray comma.
function addressLines(l) {
  const cityState = [l.address_city, l.address_state].filter(Boolean).join(", ");
  const line2 = [cityState, l.address_zip].filter(Boolean).join(" ");
  return [l.address_street, line2].filter(Boolean);
}

// lead: { id, name, phone, email, interest, message, address_*, source }
// update: true for the follow-up from the details step.
export async function sendLeadAlert(env, lead, { update = false } = {}) {
  const name = lead.name || "(no name)";
  const email = lead.email || "";
  const addr = addressLines(lead);
  const src = sourceLabel(lead.source);

  // [label, text, html] — only fields with a value.
  const rows = [["Name", name, `<strong>${esc(name)}</strong>`]];
  if (lead.phone) rows.push(["Phone", lead.phone, `<a href="tel:${esc(lead.phone)}" style="color:#D2683F">${esc(lead.phone)}</a>`]);
  if (email) rows.push(["Email", email, `<a href="mailto:${esc(email)}" style="color:#D2683F">${esc(email)}</a>`]);
  if (lead.interest) rows.push(["Space", lead.interest, esc(lead.interest)]);
  if (addr.length) rows.push(["Address", addr.join(", "),
    `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.join(", "))}" style="color:#D2683F">${addr.map(esc).join("<br/>")}</a>`]);
  if (src) rows.push(["Form", src, esc(src)]);

  const intro = update
    ? `${name} added details on the website after sending the request. Everything we have now:`
    : email
      ? `New free consultation request from the website.`
      : `New free consultation request from the website. They gave a name and phone number — text or call them to set the visit.`;

  const width = Math.max(...rows.map(([k]) => k.length)) + 2;
  const text =
`${intro}

${rows.map(([k, t]) => `${(k + ":").padEnd(width)}${t}`).join("\n")}
${lead.message ? `\nNote from the customer:\n${lead.message}\n` : ""}
Open the lead in the CRM: ${CRM_URL}
`;

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#16140F;max-width:600px;line-height:1.55">
  <h2 style="font-family:'Montserrat','Helvetica Neue',Arial,sans-serif;font-weight:400;font-size:24px;margin:0 0 8px">${update ? "Details added" : "New consultation request"}</h2>
  <p style="margin:0 0 18px;color:#3A362F">${esc(intro)}</p>
  <table style="border-collapse:collapse;width:100%;margin:0 0 20px">
    ${rows.map(([k, , h]) => `<tr><td style="padding:7px 12px 7px 0;color:#3A362F;width:110px;vertical-align:top">${k}</td><td style="padding:7px 0">${h}</td></tr>`).join("\n    ")}
  </table>
  ${lead.message ? `<p style="margin:0 0 6px;color:#3A362F">Note from the customer:</p>
  <div style="background:#FAF9F6;border-left:2px solid #D2683F;padding:12px 16px;white-space:pre-wrap;margin:0 0 20px">${esc(lead.message)}</div>` : ""}
  <p style="margin:8px 0 0">
    ${lead.phone ? `<a href="sms:${esc(lead.phone)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 18px;background:#D2683F;color:#FAF9F6;text-decoration:none;font-size:13px;font-weight:700;border-radius:6px">Text ${esc(name.split(/\s+/)[0])}</a>` : ""}
    <a href="${CRM_URL}" style="display:inline-block;margin:0 0 8px;padding:10px 18px;background:#16140F;color:#FAF9F6;text-decoration:none;font-size:13px;font-weight:700;border-radius:6px">Open in CRM</a>
  </p>
</div>`;

  const first = lead.id ? alertMessageId(lead.id) : undefined;
  return sendStaffAlert(env, {
    label: "National Closet Co. Website",
    replyTo: /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
    subject: `New consultation request — ${name}`,
    text, html,
    ...(update ? { inReplyTo: first, references: first } : { messageId: first }),
  });
}
