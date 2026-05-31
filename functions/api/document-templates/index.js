import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const kind = url.searchParams.get("kind");
  const subkind = url.searchParams.get("subkind");
  let sql = `SELECT * FROM document_templates WHERE 1=1`;
  const binds = [];
  if (kind)    { binds.push(kind);    sql += ` AND kind = ?${binds.length}`; }
  if (subkind) { binds.push(subkind); sql += ` AND subkind = ?${binds.length}`; }
  sql += ` ORDER BY kind, is_default DESC, name`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ templates: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.kind || !body.name) return json({ error: "kind + name required" }, 400);
  const r = await context.env.DB.prepare(
    `INSERT INTO document_templates (kind, subkind, name, is_default, intro, scope_html, terms_html, notes_customer,
       tier_good_title, tier_better_title, tier_best_title, valid_days, estimated_install_window)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) RETURNING id`
  ).bind(
    body.kind, body.subkind || null, body.name, body.is_default ? 1 : 0,
    body.intro || null, body.scope_html || null, body.terms_html || null, body.notes_customer || null,
    body.tier_good_title || null, body.tier_better_title || null, body.tier_best_title || null,
    body.valid_days != null ? parseInt(body.valid_days, 10) : null,
    body.estimated_install_window || null,
  ).first();
  return json({ id: r.id });
}
