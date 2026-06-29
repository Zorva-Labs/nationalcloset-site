import { requireAuth, json } from "../../_lib/auth.js";

// Allowed vendor roles/titles. Kept in sync with the UI dropdown.
export const VENDOR_ROLES = ["Installer", "Manufacturer", "Sales Rep", "Supplier", "Subcontractor", "Designer", "Other"];

// GET /api/vendors?q=&role=
//   Address-book list of every vendor with small per-row spend stats (paid,
//   outstanding, bill count) so the list page can show "$4,800 · 3 bills"
//   without an N+1.
export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q");
  const role = url.searchParams.get("role");

  let sql = `
    SELECT v.*,
           (SELECT COUNT(*) FROM expenses e WHERE e.vendor_id = v.id AND e.status != 'void') AS bill_count,
           (SELECT COALESCE(SUM(e.amount_paid_cents), 0) FROM expenses e WHERE e.vendor_id = v.id AND e.status != 'void') AS paid_cents,
           (SELECT COALESCE(SUM(e.amount_cents - e.amount_paid_cents), 0) FROM expenses e WHERE e.vendor_id = v.id AND e.status != 'void') AS outstanding_cents
      FROM vendors v
  `;
  const binds = [];
  const where = [];
  if (q) { where.push(`(v.name LIKE ?${binds.length + 1} OR v.company LIKE ?${binds.length + 1} OR v.email LIKE ?${binds.length + 1} OR v.phone LIKE ?${binds.length + 1} OR v.address_city LIKE ?${binds.length + 1})`); binds.push(`%${q}%`); }
  if (role) { where.push(`v.role = ?${binds.length + 1}`); binds.push(role); }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY datetime(v.updated_at) DESC LIMIT 300`;

  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  // Role counts for the filter chips.
  const counts = {};
  for (const r of (await context.env.DB.prepare(`SELECT role, COUNT(*) AS n FROM vendors GROUP BY role`).all()).results || []) {
    counts[r.role || "Other"] = r.n;
  }
  return json({ vendors: rows, roles: VENDOR_ROLES, counts });
}

// POST /api/vendors
export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const b = await context.request.json().catch(() => ({}));
  if (!b.name || !b.name.trim()) return json({ error: "A name is required" }, 400);
  const r = await context.env.DB.prepare(
    `INSERT INTO vendors (name, company, role, email, phone, website, address_street, address_city, address_state, address_zip, notes)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
  ).bind(
    b.name.trim(), b.company || null, b.role || null, b.email || null, b.phone || null, b.website || null,
    b.address_street || null, b.address_city || null, b.address_state || null, b.address_zip || null, b.notes || null
  ).run();
  return json({ id: r.meta.last_row_id });
}
