import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const category = url.searchParams.get("category");
  let sql = `SELECT * FROM products WHERE active=1`;
  const binds = [];
  if (category) { binds.push(category); sql += ` AND category=?${binds.length}`; }
  sql += ` ORDER BY category, position, id`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ products: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.name || !body.category) return json({ error: "Missing name or category" }, 400);
  const r = await context.env.DB.prepare(
    `INSERT INTO products (sku, name, category, description, unit, base_price_cents, price_per_sqft_cents, notes, position)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) RETURNING id`
  ).bind(
    body.sku || null, body.name, body.category, body.description || null,
    body.unit || "window",
    parseInt(body.base_price_cents || 0, 10),
    parseInt(body.price_per_sqft_cents || 0, 10),
    body.notes || null,
    parseInt(body.position || 0, 10),
  ).first();
  return json({ id: r.id });
}
