// POST /api/contact — receives the consultation form, saves the lead to D1,
// and emails the admin via the shared sendEmail() wrapper (Gmail API — Google
// Workspace; see _lib/email.js). DB save is the source of truth — a mail
// failure logs but never blocks the customer response.

import { sendStaffAlert } from "../_lib/email.js";
import { sendLeadAlert } from "../_lib/lead-alert.js";
import { sendLeadAck } from "../_lib/lead-ack.js";
import { upsertContact } from "../_lib/db.js";
import { genToken } from "../_lib/tokens.js";
import { logOutboundEmail } from "../_lib/email-log.js";
import { spamReason, botReason, turnstileReason } from "../_lib/spam.js";


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
      await sendStaffAlert(env, {
        label: "National Closet Co. Website",
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

  // Two fields are all a lead needs: a name and a phone number. Email is
  // welcome but optional (the confirmation step asks again) — every required
  // field on a paid click costs conversions, and fifteen of the twenty visitors
  // who tapped the button in the last three weeks abandoned the four-field form.
  if (!name || !phone) {
    return json({ error: "Name and phone are required." }, 400);
  }
  if (phone.replace(/\D/g, "").length < 7) {
    return json({ error: "That phone number looks incomplete." }, 400);
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "That email address looks invalid." }, 400);
  }

  // Composed single-line address for emails and the legacy `location` column
  const fullAddress = [addressStreet, [addressCity, addressState].filter(Boolean).join(", "), addressZip]
    .filter(Boolean)
    .join(" · ");

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
      // GA4 ids captured at submit time so a later booked consultation can be sent to
      // GA4 (Measurement Protocol) against this exact session and imported by Google Ads.
      const gaClientId = ((pick("ga_client_id") || "").toString().slice(0, 64)) || null;
      const gaSessionId = ((pick("ga_session_id") || "").toString().slice(0, 32)) || null;
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
        if (email) contactId = await upsertContact(env.DB, {
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
           referrer, user_agent, ip_hash, contact_id, gclid, landing_page, update_token, ga_client_id, ga_session_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25)
         RETURNING id`
      )
        .bind(
          name, phone, email || "",
          addressStreet, addressCity, addressState, addressZip, fullAddress,
          interest || null, message || null,
          source,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          ref, ua, ipHash, contactId, gclid, landingPage, updateToken, gaClientId, gaSessionId
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

  // 2) Staff alert (sent as crm@ to hello@, Reply-To the customer when there
  // is an email). Only the fields the customer gave are listed; the details
  // step sends a follow-up in the same thread (_lib/lead-alert.js). sendEmail
  // never throws, so a mail failure only logs; the lead is already saved.
  await sendLeadAlert(env, {
    id: leadId, name, phone, email, interest, message, source,
    address_street: addressStreet, address_city: addressCity, address_state: addressState, address_zip: addressZip,
  });

  // 2b) Welcome email, when we have an address to send it to (the two-field
  // form makes email optional; /api/contact-address sends this instead if the
  // email arrives on the confirmation step). Logged to the lead's timeline.
  if (dbOk && email) {
    await sendLeadAck(env, { name, email, interest, leadId, contactId }).catch((e) => console.error("[contact.js] lead acknowledgment failed:", e?.message || e));
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
