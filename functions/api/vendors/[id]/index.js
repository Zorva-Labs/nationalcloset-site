import { requireAuth, json } from "../../../_lib/auth.js";

// GET /api/vendors/[id] — the vendor + every bill linked to them + spend totals.
export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const vendor = await DB.prepare(`SELECT * FROM vendors WHERE id=?1`).bind(id).first();
  if (!vendor) return json({ error: "Not found" }, 404);

  const bills = (await DB.prepare(
    `SELECT e.id, e.description, e.category, e.amount_cents, e.amount_paid_cents, e.status,
            e.bill_date, e.due_date, e.created_at, e.project_id, p.name AS project_name
       FROM expenses e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.vendor_id = ?1
      ORDER BY datetime(COALESCE(e.bill_date, e.created_at)) DESC`
  ).bind(id).all()).results || [];

  let paid = 0, outstanding = 0, billed = 0;
  for (const b of bills) {
    if (b.status === "void") continue;
    billed += b.amount_cents || 0;
    paid += b.amount_paid_cents || 0;
    outstanding += (b.amount_cents || 0) - (b.amount_paid_cents || 0);
  }
  return json({ vendor, bills, stats: { billed_cents: billed, paid_cents: paid, outstanding_cents: outstanding, bill_count: bills.filter((b) => b.status !== "void").length } });
}

const ALLOWED = ["name", "company", "role", "title", "email", "phone", "website", "address_street", "address_city", "address_state", "address_zip", "notes"];

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = [], binds = [];
  for (const k of ALLOWED) {
    if (body[k] !== undefined) { fields.push(`${k}=?${binds.length + 1}`); binds.push(body[k] === "" ? null : body[k]); }
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);
  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE vendors SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();
  return json({ ok: true });
}

// DELETE /api/vendors/[id] — unlink any bills (keep the bill, drop the link)
// then remove the vendor. Bills are financial records, so they survive.
export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const { DB } = context.env;
  const exists = await DB.prepare(`SELECT id FROM vendors WHERE id=?1`).bind(id).first();
  if (!exists) return json({ error: "Not found" }, 404);
  await DB.prepare(`UPDATE expenses SET vendor_id=NULL WHERE vendor_id=?1`).bind(id).run();
  await DB.prepare(`DELETE FROM vendors WHERE id=?1`).bind(id).run();
  return json({ ok: true });
}
