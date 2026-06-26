// PATCH  /api/expenses/[id]  — edit a bill
// DELETE /api/expenses/[id]  — remove a bill (and its payments)
// POST   /api/expenses/[id]  { action: "mark_paid", amount_cents?, method, reference?, paid_at? }
//        — record a payment against the bill (cash-out for the cash-flow report)
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const b = await context.request.json().catch(() => ({}));
  const allowed = ["vendor", "description", "category", "project_id", "amount_cents", "bill_date", "due_date", "notes", "status"];
  const fields = [], binds = [];
  for (const k of allowed) {
    if (b[k] === undefined) continue;
    let v = b[k];
    if (k === "amount_cents") v = Math.max(0, Math.round(Number(v) || 0));
    if (k === "project_id") v = v ? parseInt(v, 10) : null;
    fields.push(`${k}=?${binds.length + 1}`); binds.push(v);
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  fields.push(`updated_at=datetime('now')`); binds.push(id);
  await context.env.DB.prepare(`UPDATE expenses SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  await context.env.DB.prepare(`DELETE FROM expense_payments WHERE expense_id=?1`).bind(id).run();
  await context.env.DB.prepare(`DELETE FROM expenses WHERE id=?1`).bind(id).run();
  await recordActivity(context.env.DB, { entityType: "expense", entityId: id, action: "deleted", actorKind: "admin", actorId: auth.id, actorName: auth.email }).catch(() => {});
  return json({ ok: true });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const b = await context.request.json().catch(() => ({}));
  const exp = await context.env.DB.prepare(`SELECT * FROM expenses WHERE id=?1`).bind(id).first();
  if (!exp) return json({ error: "Not found" }, 404);

  if (b.action === "mark_paid") {
    const DB = context.env.DB;
    const label = (b.method || "manual").toString().slice(0, 40);
    const ref = (b.reference || "").toString().trim().slice(0, 60);
    const paidMethod = ref ? `${label} · ${ref}` : label;
    let paidAt = null;
    if (b.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(b.paid_at)) paidAt = `${b.paid_at} 12:00:00`;

    const total = exp.amount_cents || 0;
    const prior = exp.amount_paid_cents || 0;
    const remaining = Math.max(0, total - prior);
    let amt = b.amount_cents != null ? Math.round(Number(b.amount_cents)) : remaining;
    if (!Number.isFinite(amt) || amt <= 0) amt = remaining;

    await DB.prepare(`INSERT INTO expense_payments (expense_id, amount_cents, method, note, paid_at) VALUES (?1,?2,?3,?4, COALESCE(?5, datetime('now')))`)
      .bind(id, amt, label, ref || null, paidAt).run();
    const newPaid = prior + amt;
    const status = newPaid >= total ? "paid" : "unpaid";
    await DB.prepare(
      `UPDATE expenses SET amount_paid_cents=?1, method=?2, status=?3,
         paid_at = CASE WHEN ?3='paid' THEN COALESCE(?4, datetime('now')) ELSE paid_at END,
         updated_at=datetime('now') WHERE id=?5`
    ).bind(newPaid, paidMethod, status, paidAt, id).run();
    await recordActivity(DB, {
      entityType: "expense", entityId: id, action: "payment",
      actorKind: "admin", actorId: auth.id, actorName: auth.email,
      details: { amount_cents: amt, method: paidMethod, paid_total: newPaid, status },
    }).catch(() => {});
    return json({ ok: true, paid: status === "paid" });
  }
  return json({ error: "Unknown action" }, 400);
}
