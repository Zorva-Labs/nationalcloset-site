import { requireAuth, json } from "../../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const contactId = url.searchParams.get("contact_id");
  const countsOnly = url.searchParams.get("counts_only") === "1";

  // Sidebar drill-down only needs count badges. Short-circuit to a cheap
  // GROUP BY when ?counts_only=1 — no need to load full project rows.
  if (countsOnly) {
    const rows = (await context.env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM projects GROUP BY status`
    ).all()).results || [];
    const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    return json({ counts });
  }

  let sql = `SELECT p.*, c.name AS contact_name, c.email AS contact_email
             FROM projects p JOIN contacts c ON c.id = p.contact_id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND p.status=?${binds.length}`; }
  if (contactId) { binds.push(parseInt(contactId, 10)); sql += ` AND p.contact_id=?${binds.length}`; }
  sql += ` ORDER BY p.updated_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  // Always include the counts map so the list page can show filter badges.
  const allCountsRows = (await context.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM projects GROUP BY status`
  ).all()).results || [];
  const counts = Object.fromEntries(allCountsRows.map((r) => [r.status, r.n]));

  return json({ projects: rows, counts });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.contact_id || !body.name) return json({ error: "Missing contact_id or name" }, 400);
  const r = await context.env.DB
    .prepare(`INSERT INTO projects (contact_id, name, description, site_address)
              VALUES (?1,?2,?3,?4) RETURNING id`)
    .bind(body.contact_id, body.name, body.description || null, body.site_address || null)
    .first();
  return json({ id: r.id });
}
