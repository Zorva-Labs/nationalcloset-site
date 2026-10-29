// POST /api/intake/lead — a lead from a sister site that shares this CRM.
// Today that is Nashville Luxury Closets & Cabinets (nashvilleluxuryclosets.com,
// brand NLC): its /api/lead saves the lead in its own D1 and emails it, then
// posts it here, server to server, so the team works it in the same CRM with
// the NLC tag on the lead and on any job made from it (migration 0081).
//
// Auth: Bearer INTAKE_SECRET (a Pages secret; ~/.env CRM_INTAKE_SECRET, the
// same value is the sending site's CRM_INTAKE_SECRET). The sending site has
// already run its own bot, geo and Turnstile checks, so none run here.
//
// Body: { brand, external_id, name, phone, email, address_street, address_city,
//         address_state, address_zip, interest, message, source_page, referrer,
//         user_agent, utm_source, utm_medium, visit }
// No acknowledgment mail and no NCC staff alert: the sending site emails its
// own owner, and an NCC-branded welcome would be the wrong company.
import { json } from "../../_lib/auth.js";
import { upsertContact } from "../../_lib/db.js";
import { saveLeadVisit } from "../../_lib/lead-visit.js";
import { BRANDS } from "../../_lib/brands.js";

export async function onRequestPost({ request, env }) {
  const bearer = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!env.INTAKE_SECRET || !bearer || bearer !== env.INTAKE_SECRET) return json({ error: "Unauthorized" }, 401);

  const d = await request.json().catch(() => null);
  if (!d) return json({ error: "Could not read the request." }, 400);
  const s = (k, n) => (d[k] == null ? "" : String(d[k]).trim()).slice(0, n) || null;

  const brand = String(d.brand || "").toUpperCase();
  if (!BRANDS.has(brand) || brand === "NCC") return json({ error: "Unknown brand." }, 400);
  const name = s("name", 120);
  const email = /^\S+@\S+\.\S+$/.test(d.email || "") ? s("email", 200) : null;
  const phone = s("phone", 40);
  if (!name || !(email || phone)) return json({ error: "A name and a phone or email are required." }, 400);
  const externalId = s("external_id", 64);

  // A resend of a lead already here answers with the same row.
  if (externalId) {
    const seen = await env.DB.prepare("SELECT id FROM leads WHERE external_id = ?1").bind(externalId).first();
    if (seen) return json({ ok: true, success: true, id: seen.id, duplicate: true });
  }

  const street = s("address_street", 200), city = s("address_city", 80);
  const state = (s("address_state", 20) || "").toUpperCase().slice(0, 2) || null, zip = s("address_zip", 10);
  const location = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" · ") || null;

  let contactId = null;
  if (email) {
    try { contactId = await upsertContact(env.DB, { name, email, phone, address: { street, city, state, zip } }); }
    catch (e) { console.error("[intake] upsertContact failed (continuing):", e?.message || e); }
  }

  let row;
  try {
    row = await env.DB.prepare(
      `INSERT INTO leads
        (name, phone, email, address_street, address_city, address_state, address_zip, location,
         interest, message, source_page, utm_source, utm_medium, referrer, user_agent, landing_page,
         contact_id, brand, external_id)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
       RETURNING id`
    ).bind(
      name, phone || "", email || "", street, city, state, zip, location,
      s("interest", 120), s("message", 5000), s("source_page", 32) || brand.toLowerCase(),
      s("utm_source", 500), s("utm_medium", 500), s("referrer", 500), s("user_agent", 240),
      d.visit && d.visit.landing ? String(d.visit.landing).slice(0, 500) : null,
      contactId, brand, externalId
    ).first();
  } catch (e) {
    console.error("[intake] lead insert failed:", e?.message || e);
    return json({ error: "not saved" }, 503);
  }
  if (d.visit && typeof d.visit === "object") await saveLeadVisit(env.DB, row.id, d.visit);
  return json({ ok: true, success: true, id: row.id });
}

export async function onRequest() {
  return json({ error: "Method not allowed." }, 405);
}
