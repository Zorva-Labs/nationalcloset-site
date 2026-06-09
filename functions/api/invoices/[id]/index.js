// GET   /api/invoices/[id]            — invoice + line items + contact/project (admin)
// PATCH /api/invoices/[id]            — edit description/type/notes/due_date + line items
// POST  /api/invoices/[id]  { action: "resend" | "void" | "mark_paid" }  (admin)
import { requireAuth, json } from "../../../_lib/auth.js";
import { sendInvoiceEmail, markInvoicePaid, sendPaymentReceipt } from "../../../_lib/invoices.js";
import { recordActivity } from "../../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const inv = await context.env.DB.prepare(
    `SELECT i.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone,
            c.address_street, c.address_city, c.address_state, c.address_zip,
            p.name AS project_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.id = ?1`
  ).bind(id).first();
  if (!inv) return json({ error: "Not found" }, 404);
  const lines = (await context.env.DB.prepare(
    `SELECT id, description, qty, unit_cents, position FROM invoice_lines WHERE invoice_id=?1 ORDER BY position, id`
  ).bind(id).all()).results || [];
  const payments = (await context.env.DB.prepare(
    `SELECT id, amount_cents, method, note, paid_at FROM invoice_payments WHERE invoice_id=?1 ORDER BY paid_at, id`
  ).bind(id).all().catch(() => ({ results: [] }))).results || [];
  return json({ invoice: inv, lines, payments });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const { DB } = context.env;
  const inv = await DB.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(id).first();
  if (!inv) return json({ error: "Not found" }, 404);
  if (inv.status === "paid") return json({ error: "Paid invoices can't be edited. Void it and create a new one if needed." }, 400);

  // Replace line items if provided, and recompute the total from them.
  let amountCents = inv.amount_cents;
  if (Array.isArray(body.lines)) {
    await DB.prepare(`DELETE FROM invoice_lines WHERE invoice_id=?1`).bind(id).run();
    let total = 0, pos = 0;
    for (const ln of body.lines) {
      const desc = (ln.description || "").toString().slice(0, 300);
      const qty = Math.max(0, Number(ln.qty) || 0);
      const unit = Math.round(Number(ln.unit_cents) || 0);
      if (!desc && !unit) continue;
      total += Math.round(qty * unit);
      await DB.prepare(
        `INSERT INTO invoice_lines (invoice_id, description, qty, unit_cents, position) VALUES (?1,?2,?3,?4,?5)`
      ).bind(id, desc, qty, unit, pos++).run();
    }
    amountCents = total;
  } else if (body.amount_cents != null) {
    amountCents = Math.round(Number(body.amount_cents) || 0);
  }

  const sets = ["amount_cents=?1", "updated_at=datetime('now')"]; const binds = [amountCents];
  for (const f of ["description", "type", "notes", "due_date"]) {
    if (body[f] !== undefined) { binds.push(body[f] === "" ? null : body[f]); sets.push(`${f}=?${binds.length}`); }
  }
  binds.push(id);
  await DB.prepare(`UPDATE invoices SET ${sets.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  await recordActivity(DB, {
    entityType: "project", entityId: inv.project_id, action: "invoice-edited",
    actorKind: "admin", actorId: auth.id, actorName: auth.email, details: { invoice_id: id, number: inv.number, amount_cents: amountCents },
  }).catch(() => {});
  return json({ ok: true, amount_cents: amountCents });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const action = body.action;
  const inv = await context.env.DB.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(id).first();
  if (!inv) return json({ error: "Not found" }, 404);

  if (action === "resend") {
    if (inv.status === "void") return json({ error: "Invoice is void" }, 400);
    const r = await sendInvoiceEmail(context.env, inv);
    return json({ ok: !!r.ok, ...(r.skipped ? { skipped: r.reason } : {}) });
  }
  if (action === "void") {
    await context.env.DB.prepare(`UPDATE invoices SET status='void', updated_at=datetime('now') WHERE id=?1`).bind(id).run();
    await recordActivity(context.env.DB, {
      entityType: "project", entityId: inv.project_id, action: "invoice-voided",
      actorKind: "admin", actorId: auth.id, actorName: auth.email, details: { invoice_id: id, number: inv.number },
    }).catch(() => {});
    return json({ ok: true });
  }
  if (action === "mark_paid") {
    // In-person / manual payment: method label (Cash, Check, Card in person…),
    // an optional reference (check #, note), an amount, and the date collected.
    const DB = context.env.DB;
    const label = (body.method || "manual").toString().slice(0, 40);
    const ref = (body.reference || "").toString().trim().slice(0, 60);
    const paid_method = ref ? `${label} · ${ref}` : label;
    let paidAt = null;
    if (body.paid_at && /^\d{4}-\d{2}-\d{2}$/.test(body.paid_at)) paidAt = `${body.paid_at} 12:00:00`;

    const total = inv.amount_cents || 0;
    const priorPaid = inv.amount_paid_cents || 0;
    const remaining = Math.max(0, total - priorPaid);
    // Amount entered by the admin (cents); defaults to the full remaining balance.
    let amt = body.amount_cents != null ? Math.round(Number(body.amount_cents)) : remaining;
    if (!Number.isFinite(amt) || amt <= 0) amt = remaining;

    // The admin can suppress the customer receipt (e.g. they'll hand over a paper one).
    const sendReceipt = body.send_receipt !== false;

    if (priorPaid + amt >= total) {
      // Covers the balance → settle in full (books deposit, sends receipt).
      // markInvoicePaid logs the completing (remaining) amount in the ledger.
      await markInvoicePaid(context.env, inv, { method: paid_method, paidAt, sendReceipt });
      return json({ ok: true, paid: true });
    }
    // Partial payment → log it, bump amount paid, keep the invoice open.
    await DB.prepare(`INSERT INTO invoice_payments (invoice_id, amount_cents, method, note, paid_at) VALUES (?1,?2,?3,?4, COALESCE(?5, datetime('now')))`)
      .bind(id, amt, label, ref || null, paidAt).run();
    const newPaid = priorPaid + amt;
    await DB.prepare(`UPDATE invoices SET amount_paid_cents=?1, paid_method=?2, updated_at=datetime('now') WHERE id=?3`).bind(newPaid, paid_method, id).run();
    await recordActivity(DB, {
      entityType: "project", entityId: inv.project_id, action: "invoice-partial-payment",
      actorKind: "admin", actorId: auth.id, actorName: auth.email,
      details: { invoice_id: id, number: inv.number, amount_cents: amt, method: paid_method, paid_total: newPaid, remaining: total - newPaid },
    }).catch(() => {});
    // Email the customer a receipt for this partial payment (best-effort).
    let receipt = null;
    if (sendReceipt) {
      receipt = await sendPaymentReceipt(context.env, { ...inv, amount_paid_cents: newPaid }, {
        amountCents: amt, method: paid_method, paidAt, paidToDate: newPaid,
      }).catch((e) => { console.error("[invoice/partial-receipt]", String(e)); return { ok: false }; });
    }
    return json({ ok: true, paid: false, amount_paid_cents: newPaid, remaining: total - newPaid, receipt_sent: !!receipt?.ok });
  }
  return json({ error: "Unknown action" }, 400);
}

// DELETE /api/invoices/[id] — permanently remove an invoice + its line items.
// (Line items are removed explicitly since D1 doesn't always enforce the
// ON DELETE CASCADE foreign key.) Logged to the project's activity feed.
export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const inv = await DB.prepare(`SELECT * FROM invoices WHERE id=?1`).bind(id).first();
  if (!inv) return json({ error: "Not found" }, 404);
  await DB.prepare(`DELETE FROM invoice_lines WHERE invoice_id=?1`).bind(id).run();
  await DB.prepare(`DELETE FROM invoices WHERE id=?1`).bind(id).run();
  await recordActivity(DB, {
    entityType: "project", entityId: inv.project_id, action: "invoice-deleted",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { invoice_id: id, number: inv.number, amount_cents: inv.amount_cents, status: inv.status },
  }).catch(() => {});
  return json({ ok: true });
}
