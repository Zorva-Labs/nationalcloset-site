// POST /api/contact — receives the consultation form, saves the lead to D1,
// and emails the admin via the shared sendEmail() wrapper (Resend HTTP API;
// see _lib/email.js for env vars). DB save is the source of truth — a mail
// failure logs but never blocks the customer response.

import { sendEmail } from "../_lib/email.js";
import { upsertContact } from "../_lib/db.js";

const TO_ADDRESS = "hello@nationalclosetco.com";

export async function onRequestPost({ request, env }) {
  // NOTE on mail delivery: we keep mail send best-effort. The lead is ALWAYS
  // saved to D1 first — that's the source of truth for the CRM. If Purelymail
  // (or any future provider) fails, we still confirm receipt to the customer
  // so the front-end never shows a "network error" on a successfully captured
  // lead. Admin sees the failure in Pages function logs and via the CRM.
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await request.json();
    } else {
      // Fallback: form-encoded (lets the form work even without JS)
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    }
  } catch (_) {
    return json({ error: "Could not read the request." }, 400);
  }

  const name = (data.name || "").toString().trim();
  const phone = (data.phone || "").toString().trim();
  const email = (data.email || "").toString().trim();
  const addressStreet = (data.address_street || "").toString().trim();
  const addressCity = (data.address_city || "").toString().trim();
  const addressState = (data.address_state || "").toString().trim().toUpperCase().slice(0, 2);
  const addressZip = (data.address_zip || "").toString().trim().slice(0, 10);
  const location = (data.location || "").toString().trim();
  const interest = (data.interest || "").toString().trim();
  const message = (data.message || "").toString().trim();
  const source = (data.source || "unknown").toString().trim().slice(0, 32);

  if (!name || !phone || !email) {
    return json({ error: "Name, phone, and email are required." }, 400);
  }
  if (!addressStreet || !addressCity || !addressState || !addressZip) {
    return json({ error: "Please provide your full service address (street, city, state, ZIP)." }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "That email address looks invalid." }, 400);
  }

  // Composed single-line address for emails and the legacy `location` column
  const fullAddress = [addressStreet, [addressCity, addressState].filter(Boolean).join(", "), addressZip]
    .filter(Boolean)
    .join(" · ");

  const subject = `New consultation request — ${name}`;

  const textBody =
`New free consultation request from the National Closet Company website.

Source form: ${source}

Name:        ${name}
Phone:       ${phone}
Email:       ${email}
Address:     ${addressStreet}
             ${addressCity}, ${addressState} ${addressZip}
Considering: ${interest || "(not specified)"}

Message:
${message || "(no message)"}

View this lead in the CRM:
https://nationalclosetco.com/crm/
`;

  const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #14110D; max-width: 600px; line-height: 1.55;">
  <h2 style="font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 400; font-size: 26px; margin: 0 0 8px;">New consultation request</h2>
  <p style="margin: 0 0 20px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #9D7A3E;">Source: ${esc(source)} form</p>
  <table style="border-collapse: collapse; width: 100%; margin: 0 0 24px;">
    <tr><td style="padding: 8px 12px 8px 0; color: #56493C; width: 130px;">Name</td><td style="padding: 8px 0;"><strong>${esc(name)}</strong></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #56493C;">Phone</td><td style="padding: 8px 0;"><a href="tel:${esc(phone)}" style="color: #9D7A3E;">${esc(phone)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #56493C;">Email</td><td style="padding: 8px 0;"><a href="mailto:${esc(email)}" style="color: #9D7A3E;">${esc(email)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #56493C; vertical-align: top;">Address</td><td style="padding: 8px 0;"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addressStreet}, ${addressCity}, ${addressState} ${addressZip}`)}" style="color: #9D7A3E;">${esc(addressStreet)}<br/>${esc(addressCity)}, ${esc(addressState)} ${esc(addressZip)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #56493C;">Considering</td><td style="padding: 8px 0;">${esc(interest || "(not specified)")}</td></tr>
  </table>
  <p style="margin: 0 0 8px; color: #56493C;">Message:</p>
  <div style="background: #F7F2EA; border-left: 2px solid #9D7A3E; padding: 14px 18px; white-space: pre-wrap;">${esc(message || "(no message)")}</div>
  <p style="margin: 28px 0 0;"><a href="https://nationalclosetco.com/crm/" style="display: inline-block; padding: 10px 18px; background: #14110D; color: #F7F2EA; text-decoration: none; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; border-radius: 2px;">Open in CRM →</a></p>
  <p style="margin: 28px 0 0; font-size: 12px; color: #8B7F6F;">Sent from the National Closet Company website. This lead has been saved to the CRM automatically.</p>
</div>`;

  // 1) Persist the lead to D1 first — this is the source of truth. If this
  // fails we DO surface an error to the customer (otherwise the lead would
  // disappear silently).
  let dbOk = false;
  let dbError = null;
  if (env.DB) {
    try {
      const ipRaw = request.headers.get("CF-Connecting-IP") || "";
      const ipHash = ipRaw ? await sha256B64Trunc(ipRaw, 22) : null;
      const ua = (request.headers.get("user-agent") || "").slice(0, 240);
      const ref = (request.headers.get("referer") || "").slice(0, 500) || null;
      const urlObj = new URL(request.url);
      const utm_source = urlObj.searchParams.get("utm_source");
      const utm_medium = urlObj.searchParams.get("utm_medium");
      const utm_campaign = urlObj.searchParams.get("utm_campaign");
      const utm_term = urlObj.searchParams.get("utm_term");
      const utm_content = urlObj.searchParams.get("utm_content");

      // Upsert a contact FIRST so we can stamp lead.contact_id at insert
      // time. Every lead now appears in the contacts list the moment it's
      // captured — if the email matches an existing contact (repeat
      // customer, second inquiry, etc.) we re-use that row instead of
      // creating a duplicate.
      let contactId = null;
      try {
        contactId = await upsertContact(env.DB, {
          name, email, phone,
          address: { street: addressStreet, city: addressCity, state: addressState, zip: addressZip },
        });
      } catch (e) {
        // Don't block lead capture on contact upsert — just log and continue
        console.error("[contact.js] upsertContact failed (continuing):", e?.message || e);
      }

      await env.DB.prepare(
        `INSERT INTO leads
          (name, phone, email,
           address_street, address_city, address_state, address_zip, location,
           interest, message,
           source_page, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           referrer, user_agent, ip_hash, contact_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)`
      )
        .bind(
          name, phone, email,
          addressStreet, addressCity, addressState, addressZip, fullAddress,
          interest || null, message || null,
          source,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          ref, ua, ipHash, contactId
        )
        .run();
      dbOk = true;
    } catch (e) {
      console.error("D1 lead insert failed:", e?.message || e);
      dbError = e?.message || "db_unknown";
    }
  } else {
    // No DB binding configured — log loudly but don't block the customer
    console.error("contact.js: env.DB is not configured");
  }

  // 2) Fire-and-forget mail send via Resend. sendEmail never throws — a mail
  // failure just logs to the Pages function console. The customer is told
  // their lead was captured (it was) regardless of email delivery.
  // We set Reply-To to the customer's email so hitting "Reply" in the admin
  // mailbox responds directly to the lead.
  await sendEmail(env, {
    to: TO_ADDRESS,
    replyTo: email,
    subject,
    text: textBody,
    html: htmlBody,
  });

  // 3) Surface the outcome. DB failure is the only reason we'd refuse the lead
  // (because then it's truly lost). Mail failure is invisible to the customer.
  if (!dbOk && env.DB) {
    return json(
      { error: "We had trouble saving your request. Please call us at 629-298-8241.", detail: dbError || "db_unavailable" },
      503
    );
  }
  return json({ success: true }, 200);
}

async function sha256B64Trunc(s, n) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  let str = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).slice(0, n);
}

// CORS / non-POST handler — small but polite
export async function onRequest({ request }) {
  if (request.method === "POST") {
    // Should never reach here; onRequestPost takes precedence.
    return new Response("Method handled separately", { status: 200 });
  }
  return json({ error: "Method not allowed." }, 405);
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
