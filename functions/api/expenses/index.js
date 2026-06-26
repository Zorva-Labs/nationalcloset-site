// GET  /api/expenses?status=unpaid|paid|void&project_id=  — list bills/expenses
// POST /api/expenses  — create a bill { vendor, description, category, project_id,
//                       amount_cents, bill_date, due_date, notes }
import { requireAuth, json } from "../../_lib/auth.js";
import { recordActivity } from "../../_lib/db.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("project_id");
  let sql = `SELECT e.*, p.name AS project_name FROM expenses e LEFT JOIN projects p ON p.id = e.project_id WHERE 1=1`;
  const binds = [];
  if (status && ["unpaid", "paid", "void"].includes(status)) { binds.push(status); sql += ` AND e.status=?${binds.length}`; }
  if (projectId) { binds.push(parseInt(projectId, 10)); sql += ` AND e.project_id=?${binds.length}`; }
  sql += ` ORDER BY COALESCE(e.bill_date, date(e.created_at)) DESC, e.id DESC LIMIT 500`;
  const expenses = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  const agg = (await context.env.DB.prepare(
    `SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_cents - amount_paid_cents), 0) AS bal FROM expenses WHERE status != 'void' GROUP BY status`
  ).all()).results || [];
  const counts = {}; let outstanding = 0;
  for (const r of agg) { counts[r.status] = r.n; if (r.status === "unpaid") outstanding += r.bal; }
  return json({ expenses, counts, outstanding_cents: outstanding });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const b = await context.request.json().catch(() => ({}));
  const amount = Math.max(0, Math.round(Number(b.amount_cents) || 0));
  if (!(b.vendor || b.description)) return json({ error: "Add a vendor or description." }, 400);
  if (amount <= 0) return json({ error: "Amount must be greater than 0." }, 400);
  const r = await context.env.DB.prepare(
    `INSERT INTO expenses (vendor, description, category, project_id, amount_cents, bill_date, due_date, notes, created_by)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) RETURNING id`
  ).bind(
    b.vendor || null, b.description || null, b.category || null, b.project_id ? parseInt(b.project_id, 10) : null,
    amount, b.bill_date || null, b.due_date || null, b.notes || null, auth.email
  ).first();
  await recordActivity(context.env.DB, {
    entityType: "expense", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { amount_cents: amount, vendor: b.vendor || null, category: b.category || null },
  }).catch(() => {});
  return json({ id: r.id });
}
