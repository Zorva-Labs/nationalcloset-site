import { requireAuth, json } from "../../../_lib/auth.js";

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = []; const binds = [];
  const allowed = ["sku","name","category","description","unit","base_price_cents","price_per_sqft_cents","notes","position","active"];
  for (const k of allowed) {
    if (body[k] !== undefined) {
      fields.push(`${k}=?${binds.length+1}`);
      binds.push(typeof body[k] === "boolean" ? (body[k] ? 1 : 0) : body[k]);
    }
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE products SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  // Soft delete (keep historical estimates intact)
  await context.env.DB.prepare(`UPDATE products SET active=0 WHERE id=?1`).bind(id).run();
  return json({ ok: true });
}
