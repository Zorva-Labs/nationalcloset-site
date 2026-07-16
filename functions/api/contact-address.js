// POST /api/contact-address — attach a service address to a lead that was just
// created by /api/contact.
//
// The lead form deliberately asks for name/phone/email/project only: every
// extra field on a paid click costs conversions, so the lead is banked (and the
// ad conversion fired) before we ask for anything else. This endpoint takes the
// address from the confirmation step afterwards.
//
// Auth is the single-use-ish update_token handed back to the browser that
// created the lead — never a lead id, which anyone could enumerate. The token
// is cleared on first successful write so a leaked one can't be replayed.

import { upsertContact } from "../_lib/db.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "unavailable" }, 503);

  let data;
  try { data = await request.json(); } catch (_) { return json({ error: "bad request" }, 400); }

  const token = (data.token || "").toString().trim();
  if (!token || token.length < 16) return json({ error: "bad token" }, 400);

  const street = (data.address_street || "").toString().trim().slice(0, 200);
  const city   = (data.address_city || "").toString().trim().slice(0, 100);
  const state  = (data.address_state || "").toString().trim().toUpperCase().slice(0, 2);
  const zip    = (data.address_zip || "").toString().trim().slice(0, 10);
  if (!street && !city && !zip) return json({ error: "nothing to save" }, 400);

  const lead = await env.DB.prepare(
    `SELECT id, contact_id, name, phone, email FROM leads WHERE update_token = ?1`
  ).bind(token).first().catch(() => null);
  // Same response either way — a wrong token shouldn't confirm what exists.
  if (!lead) return json({ error: "not found" }, 404);

  const fullAddress = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  await env.DB.prepare(
    `UPDATE leads
        SET address_street = ?1, address_city = ?2, address_state = ?3, address_zip = ?4,
            location = ?5, update_token = NULL, updated_at = datetime('now')
      WHERE id = ?6`
  ).bind(street || null, city || null, state || null, zip || null, fullAddress || null, lead.id).run();

  // Keep the contact record in step — it's what the CRM and every later
  // document read from.
  if (lead.contact_id) {
    await env.DB.prepare(
      `UPDATE contacts
          SET address_street = ?1, address_city = ?2, address_state = ?3, address_zip = ?4,
              updated_at = datetime('now')
        WHERE id = ?5`
    ).bind(street || null, city || null, state || null, zip || null, lead.contact_id).run().catch(() => {});
  }

  return json({ success: true }, 200);
}
