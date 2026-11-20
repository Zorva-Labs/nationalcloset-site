// PATCH  /api/payouts/:id { amount_cents?, note? } — correct a crew pay entry
// DELETE /api/payouts/:id                         — remove it
// Both only while it is still owed: once a Gusto payment is prepared or paid
// from it, the record stays as it is. Admin only (not in _lib/roles.js).
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

async function load(DB, id) {
  return DB.prepare(`SELECT * FROM expenses WHERE id = ?1 AND source = 'crew_pay'`).bind(id).first();
}
const locked = (e) => e.gusto_status !== "owed" || (e.amount_paid_cents || 0) > 0;
const LOCKED_MSG = "A Gusto payment is already prepared or paid from this one, so it can't change here.";

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const id = parseInt(context.params.id, 10);
  const e = await load(DB, id);
  if (!e) return json({ error: "Not found" }, 404);
  if (locked(e)) return json({ error: LOCKED_MSG }, 409);
  const b = await context.request.json().catch(() => ({}));
  const amount = b.amount_cents != null ? Math.round(Number(b.amount_cents) || 0) : e.amount_cents;
  if (!(amount > 0)) return json({ error: "Amount must be greater than 0." }, 400);
  const note = b.note !== undefined ? (String(b.note || "").trim().slice(0, 500) || null) : e.notes;
  await DB.prepare(`UPDATE expenses SET amount_cents = ?1, notes = ?2, updated_at = datetime('now') WHERE id = ?3`).bind(amount, note, id).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const id = parseInt(context.params.id, 10);
  const e = await load(DB, id);
  if (!e) return json({ error: "Not found" }, 404);
  if (locked(e)) return json({ error: LOCKED_MSG }, 409);
  await DB.prepare(`DELETE FROM expenses WHERE id = ?1`).bind(id).run();
  await recordActivity(DB, {
    entityType: "expense", entityId: id, action: "deleted",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { crew_pay: true, project_id: e.project_id, person: e.vendor, amount_cents: e.amount_cents },
  }).catch(() => {});
  return json({ ok: true });
}
