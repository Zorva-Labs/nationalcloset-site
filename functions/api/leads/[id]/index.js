import { requireAuth, json } from "../../../_lib/auth.js";

const ALLOWED_STATUSES = new Set([
  "new",
  "replied",
  "consult",
  "proposal",
  "booked",
  "installed",
  "lost",
]);
const PATCHABLE = new Set([
  "status", "assigned_to", "quoted_amount_cents",
  "name", "phone", "email",
  "interest", "message",
  "location",
  "address_street", "address_city", "address_state", "address_zip",
]);

export async function onRequestGet(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);

  const lead = await context.env.DB.prepare(`SELECT * FROM leads WHERE id = ?1`).bind(id).first();
  if (!lead) return json({ error: "Not found" }, 404);

  const { results: notes } = await context.env.DB.prepare(
    `SELECT id, body, author, created_at FROM lead_notes WHERE lead_id = ?1 ORDER BY datetime(created_at) DESC`
  )
    .bind(id)
    .all();

  return json({ lead, notes });
}

export async function onRequestPatch(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);

  let patch;
  try {
    patch = await context.request.json();
  } catch (_) {
    return json({ error: "Invalid JSON" }, 400);
  }

  const sets = [];
  const binds = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCHABLE.has(k)) continue;
    if (k === "status" && !ALLOWED_STATUSES.has(v)) {
      return json({ error: "Invalid status" }, 400);
    }
    sets.push(`${k} = ?${binds.length + 1}`);
    binds.push(v);
  }
  if (!sets.length) return json({ error: "No valid fields to update." }, 400);

  sets.push(`updated_at = datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(
    `UPDATE leads SET ${sets.join(", ")} WHERE id = ?${binds.length}`
  )
    .bind(...binds)
    .run();

  const lead = await context.env.DB.prepare(`SELECT * FROM leads WHERE id = ?1`).bind(id).first();
  return json({ lead });
}

export async function onRequestDelete(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const id = parseInt(context.params.id, 10);
  if (!Number.isFinite(id)) return json({ error: "Invalid id" }, 400);
  await context.env.DB.prepare(`DELETE FROM leads WHERE id = ?1`).bind(id).run();
  return json({ ok: true });
}
