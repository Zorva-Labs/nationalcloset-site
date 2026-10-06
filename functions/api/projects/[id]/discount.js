// POST /api/projects/[id]/discount  { amount_cents, note }
//
// A discount on a booked job, taken off its final payment (Michael,
// 2026-10-06). The figure lives on the job (projects.final_discount_cents):
// getProjectBilling takes it off the job total, so the final invoice, the
// completion sweep and Reports all bill and count the lower amount. Setting it
// also moves any money already billed and still unpaid:
// - a bigger discount first comes out of what is not invoiced yet (the final
//   payment still to be raised), then off the open invoices, the final one
//   first; an invoice brought to $0 is voided, one brought down to what was
//   already paid on it is settled;
// - a smaller discount (or none) puts the money back on the open invoices that
//   carried it; the rest is billed with the final payment.
// It can't take back money already collected: anything past what is still
// owed is refused. Nothing is emailed; the job's Send button does that.
import { requireAuth, json } from "../../../_lib/auth.js";
import { getProjectBilling } from "../../../_lib/invoices.js";
import { recordActivity } from "../../../_lib/db.js";

const BOOKED = ["contracted", "scheduled_install", "installing", "completed"];

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const body = await context.request.json().catch(() => ({}));

  const project = await DB.prepare(`SELECT id, status, final_discount_cents FROM projects WHERE id=?1`).bind(id).first();
  if (!project) return json({ error: "Job not found" }, 404);
  if (!BOOKED.includes(project.status)) return json({ error: "A discount on the final payment can be added once the job is booked." }, 400);

  const billing = await getProjectBilling(DB, id);
  const oldD = billing.finalDiscountCents || 0;
  const gross = (billing.totalCents || 0) + oldD;          // the job before any final discount
  const newD = Math.max(0, Math.round(Number(body.amount_cents) || 0));
  if (newD > gross) return json({ error: "The discount can't be more than the job total." }, 400);
  const note = String(body.note || "").trim().slice(0, 140) || null;

  const invoices = (await DB.prepare(
    `SELECT id, number, type, status, amount_cents, amount_paid_cents, discount_cents FROM invoices
      WHERE project_id=?1 AND status != 'void' ORDER BY id DESC`
  ).bind(id).all()).results || [];
  const invoiced = invoices.reduce((s, iv) => s + (iv.amount_cents || 0), 0);
  const uninvoiced = Math.max(0, (billing.totalCents || 0) - invoiced);
  // Only an open invoice can move; one mid-payment (processing) or paid stays.
  const open = invoices.filter((iv) => iv.status === "open")
    .sort((a, b) => (a.type === "balance" ? 0 : 1) - (b.type === "balance" ? 0 : 1) || b.id - a.id);
  const owedOnOpen = open.reduce((s, iv) => s + Math.max(0, (iv.amount_cents || 0) - (iv.amount_paid_cents || 0)), 0);

  const delta = newD - oldD;
  const changes = [];   // { iv, amount, discount }
  if (delta > 0) {
    const room = uninvoiced + owedOnOpen;
    if (delta > room) {
      return json({ error: `That is more than is still owed on this job (${fmt(room)} can come off). Money already collected would have to be refunded instead.` }, 400);
    }
    let left = Math.max(0, delta - uninvoiced);
    for (const iv of open) {
      if (left <= 0) break;
      const take = Math.min(left, Math.max(0, (iv.amount_cents || 0) - (iv.amount_paid_cents || 0)));
      if (take <= 0) continue;
      changes.push({ iv, amount: iv.amount_cents - take, discount: (iv.discount_cents || 0) + take });
      left -= take;
    }
  } else if (delta < 0) {
    let give = -delta;
    for (const iv of open) {
      if (give <= 0) break;
      const add = Math.min(give, iv.discount_cents || 0);
      if (add <= 0) continue;
      changes.push({ iv, amount: iv.amount_cents + add, discount: iv.discount_cents - add });
      give -= add;
    }
  }

  const stmts = [
    DB.prepare(`UPDATE projects SET final_discount_cents=?1, final_discount_note=?2, updated_at=datetime('now') WHERE id=?3`)
      .bind(newD, newD > 0 ? note : null, id),
  ];
  const adjusted = [];
  for (const c of changes) {
    const paid = c.iv.amount_paid_cents || 0;
    // $0 left to bill and nothing paid: void it. Brought down to what was
    // already paid: it is settled.
    const status = c.amount <= 0 && paid <= 0 ? "void" : (c.amount <= paid ? "paid" : "open");
    stmts.push(DB.prepare(
      `UPDATE invoices SET amount_cents=?1, discount_cents=?2, status=?3,
         paid_at=CASE WHEN ?3='paid' THEN COALESCE(paid_at, datetime('now')) ELSE paid_at END,
         updated_at=datetime('now') WHERE id=?4`
    ).bind(Math.max(0, c.amount), Math.max(0, c.discount), status, c.iv.id));
    adjusted.push({ id: c.iv.id, number: c.iv.number, amount_cents: Math.max(0, c.amount), status });
  }
  await DB.batch(stmts);

  await recordActivity(DB, {
    entityType: "project", entityId: id, action: "final-discount-set",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { from_cents: oldD, to_cents: newD, note, adjusted },
  }).catch(() => {});

  return json({ ok: true, final_discount_cents: newD, final_discount_note: newD > 0 ? note : null, adjusted });
}

function fmt(cents) {
  return "$" + (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
