// County property records for a lead or job (Michael, 2026-11-20).
//
// GET /api/property?lead_id=N | ?project_id=N [&refresh=1]
//   The address comes from the lead (its address fields) or the job (its site
//   address, else the client's address). The first look reads the county's open
//   parcel data (_lib/property.js) and keeps the answer in property_records; after
//   that the page reads it from D1 until someone presses Refresh. Admin and sales
//   (listed in _lib/roles.js); public record only.
import { requireAuth, json } from "../_lib/auth.js";
import { lookupProperty, addressKey } from "../_lib/property.js";

// "617 Wedgewood Ave, Nashville, TN 37203" → parts. The street is everything
// before the first comma; the city the next part; a state and ZIP at the end.
function splitAddress(s) {
  const parts = String(s || "").split(",").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const out = { street: parts[0], city: parts[1] || "", state: "TN", zip: "" };
  const tail = parts.slice(1).join(" ");
  const z = tail.match(/\b(\d{5})(?:-\d{4})?\b/); if (z) out.zip = z[1];
  const st = tail.match(/\b([A-Z]{2})\b(?=\s*\d{5}|\s*$)/i); if (st) out.state = st[1].toUpperCase();
  if (parts.length === 2) out.city = parts[1].replace(/\b[A-Z]{2}\b\s*\d{5}.*$/i, "").replace(/\d{5}.*$/, "").trim();
  return out;
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const q = new URL(context.request.url).searchParams;
  const leadId = parseInt(q.get("lead_id") || "", 10);
  const projectId = parseInt(q.get("project_id") || "", 10);

  let addr = null;
  if (leadId) {
    const l = await DB.prepare(`SELECT address_street, address_city, address_state, address_zip FROM leads WHERE id = ?`).bind(leadId).first();
    if (!l) return json({ error: "Lead not found" }, 404);
    if (l.address_street) addr = { street: l.address_street, city: l.address_city || "", state: l.address_state || "TN", zip: l.address_zip || "" };
  } else if (projectId) {
    const p = await DB.prepare(
      `SELECT p.site_address, c.address_street, c.address_city, c.address_state, c.address_zip
         FROM projects p LEFT JOIN contacts c ON c.id = p.contact_id WHERE p.id = ?`
    ).bind(projectId).first();
    if (!p) return json({ error: "Job not found" }, 404);
    if (p.site_address) addr = splitAddress(p.site_address);
    else if (p.address_street) addr = { street: p.address_street, city: p.address_city || "", state: p.address_state || "TN", zip: p.address_zip || "" };
  } else {
    return json({ error: "lead_id or project_id is required" }, 400);
  }
  if (!addr || !addr.street) return json({ record: null, reason: "no_address" });

  const key = addressKey(addr);
  if (q.get("refresh") !== "1") {
    const cached = await DB.prepare(`SELECT * FROM property_records WHERE addr_key = ?`).bind(key).first();
    if (cached) return json({ record: cached, address: addr, cached: true });
  }

  const r = await lookupProperty(addr);
  const cols = ["status", "county", "source", "data_as_of", "parcel_id", "owner", "prop_address", "land_use", "year_built", "sqft",
    "beds", "baths", "acres", "land_value", "impr_value", "total_value", "last_sale_date", "last_sale_price", "record_url", "search_url", "note"];
  // A failed read (a county service down) isn't kept, so the next look tries again.
  if (r.status !== "error") {
    await DB.prepare(
      `INSERT INTO property_records (addr_key, ${cols.join(", ")}, looked_up_at) VALUES (?, ${cols.map(() => "?").join(", ")}, datetime('now'))
       ON CONFLICT(addr_key) DO UPDATE SET ${cols.map(c => `${c} = excluded.${c}`).join(", ")}, looked_up_at = excluded.looked_up_at`
    ).bind(key, ...cols.map(c => r[c] ?? null)).run();
  }
  const record = await DB.prepare(`SELECT * FROM property_records WHERE addr_key = ?`).bind(key).first();
  return json({ record: record || { ...r, addr_key: key }, address: addr, cached: false });
}
