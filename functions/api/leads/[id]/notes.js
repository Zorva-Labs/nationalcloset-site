import { requireAuth, json } from "../../../_lib/auth.js";

export async function onRequestPost(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);

  let body;
  try {
    body = await context.request.json();
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }
  const text = (body.body || "").toString().trim();
  if (!text) return json({ error: "Note body is required." }, 400);

  const lead = await context.env.DB.prepare(`SELECT id FROM leads WHERE id = ?1`).bind(id).first();
  if (!lead) return json({ error: "Lead not found" }, 404);

  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO lead_notes (lead_id, body, author) VALUES (?1, ?2, ?3)`
    ).bind(id, text.slice(0, 4000), guard.email),
    context.env.DB.prepare(`UPDATE leads SET updated_at = datetime('now') WHERE id = ?1`).bind(id),
  ]);

  const { results: notes } = await context.env.DB.prepare(
    `SELECT id, body, author, created_at FROM lead_notes WHERE lead_id = ?1 ORDER BY datetime(created_at) DESC`
  )
    .bind(id)
    .all();
  return json({ notes });
}
