// POST /api/contact — receives the consultation form, saves the lead to D1,
// and emails the admin via the shared sendEmail() wrapper (Gmail API — Google
// Workspace; see _lib/email.js). DB save is the source of truth — a mail
// failure logs but never blocks the customer response.

import { sendEmail, brandedEmail, makeMessageId } from "../_lib/email.js";
import { upsertContact } from "../_lib/db.js";
import { genToken } from "../_lib/tokens.js";
import { logOutboundEmail } from "../_lib/email-log.js";
import { spamReason, botReason, turnstileReason } from "../_lib/spam.js";

const TO_ADDRESS = "hello@nationalclosetco.com";

export async function onRequestPost({ request, env }) {
  // NOTE on mail delivery: we keep mail send best-effort. The lead is ALWAYS
  // saved to D1 first — that's the source of truth for the CRM. If the mail
  // provider fails, we still confirm receipt to the customer
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

  // High-confidence bot gate — a filled honeypot, an impossibly fast submit, or
  // a Turnstile token Cloudflare explicitly rejected. Near-zero false positives,
  // so drop SILENTLY (return ok so the bot doesn't retry) with no team alert.
  // All three FAIL OPEN when their signal is absent, so a real lead is never
  // blocked because the check couldn't run.
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const bot = botReason(data) || (await turnstileReason(env, data.cf_ts, ip));
  if (bot) { console.warn("[contact.js] bot drop:", bot); return json({ ok: true }); }

  // Spam gate — drop bots (links, SEO/marketing pitches) BEFORE we save or email
  // anything. Return ok so the bot thinks it succeeded and doesn't retry; a real
  // closet lead never trips these signals. Unlike the bot gate above these are
  // fuzzier, so a filtered submission still emails the team for a human to review.
  const spam = spamReason(data);
  if (spam) {
    console.warn("[contact.js] filtered submission:", spam);
    // NEVER vanish silently. A filtered submission is not saved to the CRM (keeps
    // obvious bot spam out), but we still email the team so a misclassified real
    // customer is visible and recoverable. Best-effort — never blocks the response.
    try {
      await sendEmail(env, {
        from: "National Closet Co. Website <hello@nationalclosetco.com>",
        to: TO_ADDRESS,
        replyTo: /^\S+@\S+\.\S+$/.test(email) ? email : undefined,
        subject: `[Filtered — please review] Website submission from ${name || "(no name)"}`,
        text:
`A website form submission was auto-filtered as possible spam (reason: ${spam}) and was NOT saved to the CRM.
If this looks like a real customer, add them to the CRM manually and reply directly.

Name:    ${name || "(none)"}
Phone:   ${phone || "(none)"}
Email:   ${email || "(none)"}
Message: ${message || "(none)"}
`,
      });
    } catch (e) { console.error("[contact.js] filtered-alert email failed:", e?.message || e); }
    return json({ ok: true });
  }

  if (!name || !phone || !email) {
    return json({ error: "Name, phone, and email are required." }, 400);
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
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #16140F; max-width: 600px; line-height: 1.55;">
  <h2 style="font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; font-weight: 400; font-size: 26px; margin: 0 0 8px;">New consultation request</h2>
  <p style="margin: 0 0 20px; font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #D2683F;">Source: ${esc(source)} form</p>
  <table style="border-collapse: collapse; width: 100%; margin: 0 0 24px;">
    <tr><td style="padding: 8px 12px 8px 0; color: #3A362F; width: 130px;">Name</td><td style="padding: 8px 0;"><strong>${esc(name)}</strong></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #3A362F;">Phone</td><td style="padding: 8px 0;"><a href="tel:${esc(phone)}" style="color: #D2683F;">${esc(phone)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #3A362F;">Email</td><td style="padding: 8px 0;"><a href="mailto:${esc(email)}" style="color: #D2683F;">${esc(email)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #3A362F; vertical-align: top;">Address</td><td style="padding: 8px 0;"><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${addressStreet}, ${addressCity}, ${addressState} ${addressZip}`)}" style="color: #D2683F;">${esc(addressStreet)}<br/>${esc(addressCity)}, ${esc(addressState)} ${esc(addressZip)}</a></td></tr>
    <tr><td style="padding: 8px 12px 8px 0; color: #3A362F;">Considering</td><td style="padding: 8px 0;">${esc(interest || "(not specified)")}</td></tr>
  </table>
  <p style="margin: 0 0 8px; color: #3A362F;">Message:</p>
  <div style="background: #FAF9F6; border-left: 2px solid #D2683F; padding: 14px 18px; white-space: pre-wrap;">${esc(message || "(no message)")}</div>
  <p style="margin: 28px 0 0;"><a href="https://nationalclosetco.com/crm/" style="display: inline-block; padding: 10px 18px; background: #16140F; color: #FAF9F6; text-decoration: none; font-family: 'Montserrat','Helvetica Neue',Arial,sans-serif; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; border-radius: 2px;">Open in CRM →</a></p>
  <p style="margin: 28px 0 0; font-size: 12px; color: #8B7F6F;">Sent from the National Closet Company website. This lead has been saved to the CRM automatically.</p>
</div>`;

  // 1) Persist the lead to D1 first — this is the source of truth. If this
  // fails we DO surface an error to the customer (otherwise the lead would
  // disappear silently).
  let dbOk = false;
  let dbError = null;
  let leadId = null;
  let contactId = null;
  let updateToken = null;
  if (env.DB) {
    try {
      const ipRaw = request.headers.get("CF-Connecting-IP") || "";
      const ipHash = ipRaw ? await sha256B64Trunc(ipRaw, 22) : null;
      const ua = (request.headers.get("user-agent") || "").slice(0, 240);
      const urlObj = new URL(request.url);
      // Attribution comes from the BODY. This endpoint only ever sees a POST to
      // /api/contact, so request.url carries no campaign params and the referer
      // header is our own page — reading them here (as this once did) always
      // yielded null. The client reads them off the landing URL and sends them.
      // Query params stay as a fallback for any non-JS/server-side caller.
      const pick = (k) => {
        const v = data[k] != null && data[k] !== "" ? data[k] : urlObj.searchParams.get(k);
        return v ? String(v).slice(0, 500) : null;
      };
      const utm_source = pick("utm_source");
      const utm_medium = pick("utm_medium");
      const utm_campaign = pick("utm_campaign");
      const utm_term = pick("utm_term");
      const utm_content = pick("utm_content");
      const gclid = pick("gclid");
      const landingPage = pick("landing_page");
      // Handed back to this browser only, so the confirmation step can attach a
      // service address to THIS lead without lead ids ever going public.
      updateToken = genToken(24);
      // Prefer the real referrer the browser saw on the landing page; the
      // request header only tells us which of our own pages hosted the form.
      const ref = pick("referrer") || (request.headers.get("referer") || "").slice(0, 500) || null;

      // Upsert a contact FIRST so we can stamp lead.contact_id at insert
      // time. Every lead now appears in the contacts list the moment it's
      // captured — if the email matches an existing contact (repeat
      // customer, second inquiry, etc.) we re-use that row instead of
      // creating a duplicate.
      try {
        contactId = await upsertContact(env.DB, {
          name, email, phone,
          address: { street: addressStreet, city: addressCity, state: addressState, zip: addressZip },
        });
      } catch (e) {
        // Don't block lead capture on contact upsert — just log and continue
        console.error("[contact.js] upsertContact failed (continuing):", e?.message || e);
      }

      const leadRow = await env.DB.prepare(
        `INSERT INTO leads
          (name, phone, email,
           address_street, address_city, address_state, address_zip, location,
           interest, message,
           source_page, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
           referrer, user_agent, ip_hash, contact_id, gclid, landing_page, update_token)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)
         RETURNING id`
      )
        .bind(
          name, phone, email,
          addressStreet, addressCity, addressState, addressZip, fullAddress,
          interest || null, message || null,
          source,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          ref, ua, ipHash, contactId, gclid, landingPage, updateToken
        )
        .first();
      leadId = leadRow?.id || null;
      dbOk = true;
    } catch (e) {
      console.error("D1 lead insert failed:", e?.message || e);
      dbError = e?.message || "db_unknown";
    }
  } else {
    // No DB binding configured — log loudly but don't block the customer
    console.error("contact.js: env.DB is not configured");
  }

  // 2) Fire-and-forget mail send via Gmail. sendEmail never throws — a mail
  // failure just logs to the Pages function console. The customer is told
  // their lead was captured (it was) regardless of email delivery.
  // We set Reply-To to the customer's email so hitting "Reply" in the admin
  // mailbox responds directly to the lead.
  // Send the internal notification from a DISTINCT sender (not hello@) so it is
  // not a self-addressed message (from == to), which receivers commonly junk.
  // Reply-To stays the customer so hitting Reply answers the lead directly.
  await sendEmail(env, {
    from: "National Closet Co. Website <hello@nationalclosetco.com>",
    to: TO_ADDRESS,
    replyTo: email,
    subject,
    text: textBody,
    html: htmlBody,
  });

  // 2b) Send the customer a branded acknowledgment AND log it to the CRM so the
  // lead's Messages timeline reflects the conversation from the very first touch.
  // Best-effort — never blocks the customer response. (Leaves the lead in "New";
  // it advances to "Contacted" when a team member personally emails them.)
  if (dbOk && email) {
    try {
      const first = (name || "there").split(" ")[0];
      const ackSubject = `Thanks for reaching out to National Closet Company, ${first}`;
      const ackHtml = brandedEmail({
        title: "Thanks for reaching out!",
        body: `
          <p>Hi ${esc(first)},</p>
          <p>Thank you for contacting National Closet Company${interest ? ` about your ${esc(String(interest).toLowerCase())}` : ""}. We've received your request, and a member of our family-owned team will reach out within one business day to schedule your <strong>free in-home design</strong>.</p>
          <p>If you'd like to talk sooner, just call or text us at <strong>629-298-8241</strong>.</p>
          <p>We look forward to helping you build a beautiful custom space at a price that makes sense.</p>
          <p>Warmly,<br>Michael Blair<br>National Closet Company</p>`,
      });
      const ackText = `Hi ${first},\n\nThank you for contacting National Closet Company. We've received your request and will reach out within one business day to schedule your free in-home design.\n\nCall or text us anytime at 629-298-8241.\n\nWarmly,\nMichael Blair\nNational Closet Company`;
      const ackMsgId = makeMessageId();
      const ackTo = name ? `${name} <${email}>` : email;
      const res = await sendEmail(env, { to: ackTo, subject: ackSubject, html: ackHtml, text: ackText, messageId: ackMsgId });
      const failed = res?.skipped || res?.error || (res?.status && res.status >= 400);
      await logOutboundEmail(env, {
        to: ackTo, subject: ackSubject, html: ackHtml, text: ackText, messageId: ackMsgId,
        leadId, contactId, templateKind: "lead_ack", status: failed ? "failed" : "sent",
      });
    } catch (e) {
      console.error("[contact.js] lead acknowledgment failed:", e?.message || e);
    }
  }

  // 3) Surface the outcome. A lead that didn't save is truly lost, so we NEVER
  // pretend success — including when the D1 binding is missing entirely (env.DB
  // absent). Silently returning success on an unsaved lead once cost real leads,
  // so any non-save is a hard error that tells the customer to call.
  if (!dbOk) {
    return json(
      { error: "We had trouble saving your request. Please call us at 629-298-8241.", detail: dbError || (env.DB ? "db_unavailable" : "db_unbound") },
      503
    );
  }
  // The token lets the page ask for a service address as a second step.
  return json({ success: true, update_token: dbOk ? updateToken : null }, 200);
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
