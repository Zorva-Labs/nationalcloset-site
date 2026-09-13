// POST /api/contact-address — the optional second step after the two-field
// lead form. The lead is already saved (and the ad conversion fired) by the
// time this runs, so everything here is a bonus: an email, what the project
// is, the address, a note. Any subset is fine.
//
// Auth is the single-use update_token handed back to the browser that created
// the lead — never a lead id, which anyone could enumerate. The token is
// cleared on the first successful write so a leaked one can't be replayed.
import { upsertContact } from "../_lib/db.js";
import { sendLeadAck } from "../_lib/lead-ack.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "unavailable" }, 503);

  let data;
  try { data = await request.json(); } catch (_) { return json({ error: "bad request" }, 400); }

  const token = (data.token || "").toString().trim();
  if (!token || token.length < 16) return json({ error: "bad token" }, 400);

  const str = (k, n) => (data[k] || "").toString().trim().slice(0, n);
  const email = str("email", 200);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "That email address looks invalid." }, 400);
  const interest = str("interest", 80);
  const message = str("message", 2000);
  const street = str("address_street", 200);
  const city = str("address_city", 100);
  const state = str("address_state", 2).toUpperCase();
  const zip = str("address_zip", 10);
  const hasAddress = !!(street || city || zip);
  if (!email && !interest && !message && !hasAddress) return json({ error: "nothing to save" }, 400);

  const lead = await env.DB.prepare(
    `SELECT id, contact_id, name, phone, email, interest, message FROM leads WHERE update_token = ?1`
  ).bind(token).first().catch(() => null);
  // Same response either way — a wrong token shouldn't confirm what exists.
  if (!lead) return json({ error: "not found" }, 404);

  const sets = [], binds = [];
  const set = (col, val) => { binds.push(val); sets.push(`${col} = ?${binds.length}`); };
  if (email && !lead.email) set("email", email);
  if (interest) set("interest", interest);
  if (message) set("message", lead.message ? `${lead.message}\n\n${message}` : message);
  if (hasAddress) {
    const fullAddress = [street, [city, state].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
    set("address_street", street || null); set("address_city", city || null);
    set("address_state", state || null); set("address_zip", zip || null);
    set("location", fullAddress || null);
  }
  sets.push("update_token = NULL", "updated_at = datetime('now')");
  binds.push(lead.id);
  await env.DB.prepare(`UPDATE leads SET ${sets.join(", ")} WHERE id = ?${binds.length}`).bind(...binds).run();

  // Keep the contact record in step — it's what the CRM and every later
  // document read from. A lead that came in without an email has no contact
  // row yet; the email arriving now is what lets us create one.
  let contactId = lead.contact_id || null;
  const finalEmail = lead.email || email;
  const address = hasAddress ? { street, city, state, zip } : null;
  try {
    if (!contactId && finalEmail) {
      contactId = await upsertContact(env.DB, { name: lead.name, email: finalEmail, phone: lead.phone, address });
      await env.DB.prepare(`UPDATE leads SET contact_id = ?1 WHERE id = ?2`).bind(contactId, lead.id).run();
    } else if (contactId && hasAddress) {
      await env.DB.prepare(
        `UPDATE contacts SET address_street = ?1, address_city = ?2, address_state = ?3, address_zip = ?4, updated_at = datetime('now') WHERE id = ?5`
      ).bind(street || null, city || null, state || null, zip || null, contactId).run();
    }
  } catch (e) { console.error("[contact-address] contact sync failed:", e?.message || e); }

  // The welcome email goes out the moment we have somewhere to send it.
  if (email && !lead.email) {
    await sendLeadAck(env, { name: lead.name, email, interest: interest || lead.interest, leadId: lead.id, contactId }).catch(() => {});
  }

  return json({ success: true }, 200);
}
