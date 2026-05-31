import { requireAuth, json } from "../../_lib/auth.js";
import { upsertContact } from "../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const q = url.searchParams.get("q");
  // Address-book view: every contact + small per-row stats so the list page
  // can render "3 jobs · $4,800" without N+1. Search now also matches city.
  let sql = `
    SELECT c.*,
           (SELECT COUNT(*) FROM projects p WHERE p.contact_id = c.id) AS project_count,
           (SELECT COUNT(*) FROM contracts k
              JOIN projects p ON p.id = k.project_id
             WHERE p.contact_id = c.id AND k.status IN ('fully_executed','signed_by_customer')) AS booked_count,
           (SELECT COALESCE(SUM(k.total_cents), 0) FROM contracts k
              JOIN projects p ON p.id = k.project_id
             WHERE p.contact_id = c.id AND k.status IN ('fully_executed','signed_by_customer')) AS lifetime_value_cents,
           (SELECT MAX(p.updated_at) FROM projects p WHERE p.contact_id = c.id) AS last_project_at
      FROM contacts c
  `;
  const binds = [];
  if (q) {
    sql += ` WHERE c.name LIKE ?1 OR c.email LIKE ?1 OR c.phone LIKE ?1 OR c.address_city LIKE ?1`;
    binds.push(`%${q}%`);
  }
  sql += ` ORDER BY datetime(c.updated_at) DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ contacts: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.name || !body.email) return json({ error: "Missing name or email" }, 400);
  const id = await upsertContact(context.env.DB, {
    name: body.name, email: body.email, phone: body.phone, address: body.address,
  });
  return json({ id });
}
