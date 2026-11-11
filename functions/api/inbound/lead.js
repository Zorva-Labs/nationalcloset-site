// POST /api/inbound/lead — a lead from an outside program, on its own API key.
// Michael, 2026-11-11: leads from GoHighLevel. Each program has its own key
// (migration 0085, functions/_lib/api-keys.js, made with tools/crm/api-key.mjs),
// so its leads carry its name (source_page = the key's source) and one key is
// revoked without touching the others. The sister site's /api/intake/lead keeps
// its shared secret.
//
// Auth: Authorization: Bearer <key>, X-API-Key: <key>, or `api_key` in the body
// or its customData (GoHighLevel's plain Webhook action sets no headers).
//
// Body: JSON or form-encoded, in either shape:
//   ours  — { name, phone, email, address_street, address_city, address_state,
//             address_zip, interest, message, utm_source, utm_medium,
//             utm_campaign, gclid, landing_page, referrer, external_id }
//   GoHighLevel's Webhook action — { contact_id, full_name | first_name +
//             last_name, phone, email, address1, city, state, postal_code,
//             customData: { interest, message, … }, attributionSource:
//             { utmSource, utmMedium, campaign, gclid, url, referrer } }
// A name and a phone or email are required. external_id (or the GoHighLevel
// contact_id) makes a resend answer with the lead already saved.
//
// Saved like a website lead: the contact upserted, the row in `leads` with the
// key's brand, then the staff alert to hello@ ("New lead from GoHighLevel").
// No acknowledgment to the customer: the sending program runs its own
// follow-up, and two welcomes would read as two companies.
// 200 + success:true means saved; a lead that did not save is a 503.
import { json } from "../../_lib/auth.js";
import { upsertContact } from "../../_lib/db.js";
import { checkApiKey, presentedKey } from "../../_lib/api-keys.js";
import { sendLeadAlert } from "../../_lib/lead-alert.js";

export async function onRequestPost({ request, env }) {
  let d;
  try {
    const ct = request.headers.get("content-type") || "";
    d = ct.includes("application/json") ? await request.json() : Object.fromEntries((await request.formData()).entries());
  } catch (_) { d = null; }
  if (!d || typeof d !== "object") return json({ error: "Could not read the request." }, 400);

  const key = await checkApiKey(env.DB, presentedKey(request, d)).catch((e) => { console.error("[inbound] key check failed:", e?.message || e); return null; });
  if (!key) return json({ error: "Unauthorized" }, 401);

  const c = d.customData && typeof d.customData === "object" ? d.customData : {};
  const a = d.attributionSource && typeof d.attributionSource === "object" ? d.attributionSource : {};
  const first = (...vals) => { for (const v of vals) if (v != null && String(v).trim() !== "") return String(v).trim(); return ""; };
  const cut = (v, n) => (v ? String(v).slice(0, n) : null);

  const name = cut(first(d.name, d.full_name, [d.first_name, d.last_name].filter(Boolean).join(" "), c.name), 120);
  const phone = cut(first(d.phone, c.phone), 40);
  const emailRaw = first(d.email, c.email);
  const email = /^\S+@\S+\.\S+$/.test(emailRaw) ? emailRaw.slice(0, 200) : null;
  if (!name || !(phone || email)) return json({ error: "A name and a phone or email are required." }, 400);

  const street = cut(first(d.address_street, d.address1, c.address), 200);
  const city = cut(first(d.address_city, d.city, c.city), 80);
  const state = first(d.address_state, d.state, c.state).toUpperCase().slice(0, 2) || null;
  const zip = cut(first(d.address_zip, d.postal_code, c.postal_code, c.zip), 10);
  const location = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" · ") || null;
  const interest = cut(first(d.interest, c.interest, c.space, c.service), 120);
  const message = cut(first(d.message, c.message, c.notes, d.notes), 5000);
  const utmSource = cut(first(d.utm_source, a.utmSource, a.utm_source), 500);
  const utmMedium = cut(first(d.utm_medium, a.utmMedium, a.utm_medium), 500);
  const utmCampaign = cut(first(d.utm_campaign, a.campaign, a.utmCampaign), 500);
  const gclid = cut(first(d.gclid, a.gclid), 500);
  const landing = cut(first(d.landing_page, a.url), 500);
  const referrer = cut(first(d.referrer, a.referrer), 500);
  const ext = first(d.external_id, c.external_id, d.contact_id);
  const externalId = ext ? `${key.source}:${ext}`.slice(0, 64) : null;

  if (externalId) {
    const seen = await env.DB.prepare("SELECT id FROM leads WHERE external_id = ?1").bind(externalId).first();
    if (seen) return json({ ok: true, success: true, id: seen.id, duplicate: true });
  }

  let contactId = null;
  if (email) {
    try { contactId = await upsertContact(env.DB, { name, email, phone, address: { street, city, state, zip } }); }
    catch (e) { console.error("[inbound] upsertContact failed (continuing):", e?.message || e); }
  }

  let row;
  try {
    row = await env.DB.prepare(
      `INSERT INTO leads
        (name, phone, email, address_street, address_city, address_state, address_zip, location,
         interest, message, source_page, utm_source, utm_medium, utm_campaign, gclid, referrer,
         user_agent, landing_page, contact_id, brand, external_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
       RETURNING id`
    ).bind(
      name, phone || "", email || "", street, city, state, zip, location,
      interest, message, key.source, utmSource, utmMedium, utmCampaign, gclid, referrer,
      (request.headers.get("user-agent") || "").slice(0, 240) || null, landing, contactId, key.brand, externalId
    ).first();
  } catch (e) {
    console.error("[inbound] lead insert failed:", e?.message || e);
    return json({ error: "not saved" }, 503);
  }

  const srcLines = [
    ["Source", `${key.name} (API key #${key.id})`],
    ...(utmSource || utmMedium ? [["Campaign", [utmSource, utmMedium, utmCampaign].filter(Boolean).join(" / ")]] : []),
    ...(landing ? [["Landed on", landing]] : []),
    ...(gclid ? [["Ad click", "yes (gclid)"]] : []),
  ];
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  await sendLeadAlert(env, {
    id: row.id, name, phone, email, interest, message, via: key.name,
    address_street: street, address_city: city, address_state: state, address_zip: zip,
    sourceText: ["Where this lead came from", ...srcLines.map(([k, v]) => `${k}: ${v}`)].join("\n"),
    sourceHtml: `<p style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6B6560;margin:26px 0 10px;border-top:1px solid #E7E3DE;padding-top:18px">Where this lead came from</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">${srcLines.map(([k, v]) => `<tr><td style="padding:7px 12px 7px 0;color:#6B6560;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;color:#1A1919">${esc(v)}</td></tr>`).join("")}</table>`,
  }).catch((e) => console.error("[inbound] staff alert failed:", e?.message || e));

  return json({ ok: true, success: true, id: row.id });
}

export async function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}
