// GET  /api/projects/[id]/financials  — cost breakdown + profit for one job
// PUT  /api/projects/[id]/financials  — save price/expense overrides
//
// Expenses auto-derive from the client price (see _lib/financials.js). Each
// line can be manually overridden; the price defaults to the job's contract /
// accepted-proposal total but can also be overridden.
import { requireAuth, json } from "../../../_lib/auth.js";
import { getProjectBilling } from "../../../_lib/invoices.js";
import { resolveFinancials, computeBreakdown } from "../../../_lib/financials.js";
import { recordActivity } from "../../../_lib/db.js";

async function defaultPrice(env, projectId) {
  const b = await getProjectBilling(env.DB, projectId).catch(() => null);
  return b?.totalCents || 0;
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM job_financials WHERE project_id=?1`).bind(id).first().catch(() => null);
  const dp = await defaultPrice(context.env, id);
  return json({ financials: { ...resolveFinancials(dp, row), default_price_cents: dp } });
}

export async function onRequestPut(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const dp = await defaultPrice(context.env, id);

  // Price: manual override if a value is sent AND price_auto is not true.
  const priceOverride = body.price_cents != null && body.price_auto !== true;
  const price = priceOverride ? Math.max(0, Math.round(Number(body.price_cents) || 0)) : dp;
  const f = computeBreakdown(price);

  // Each expense line: auto (use formula) unless the client flags it manual.
  const cents = (v) => Math.max(0, Math.round(Number(v) || 0));
  const lineFor = (key, autoKey) => (body[autoKey] === false)
    ? { v: cents(body[key + "_cents"]), a: 0 }
    : { v: f[key], a: 1 };
  const m = lineFor("materials", "materials_auto");
  const s = lineFor("shipping", "shipping_auto");
  const t = lineFor("tax", "tax_auto");
  const l = lineFor("labor", "labor_auto");
  const misc = cents(body.misc_cents);

  await context.env.DB.prepare(
    `INSERT INTO job_financials
       (project_id, price_cents, discount_pct, materials_cents, shipping_cents, tax_cents, labor_cents, misc_cents,
        price_auto, materials_auto, shipping_auto, tax_auto, labor_auto, notes, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET
       price_cents=?2, discount_pct=?3, materials_cents=?4, shipping_cents=?5, tax_cents=?6, labor_cents=?7,
       misc_cents=?8, price_auto=?9, materials_auto=?10, shipping_auto=?11, tax_auto=?12, labor_auto=?13,
       notes=?14, updated_at=datetime('now')`
  ).bind(
    id, price, f.discount, m.v, s.v, t.v, l.v, misc,
    priceOverride ? 0 : 1, m.a, s.a, t.a, l.a, (body.notes || null),
  ).run();

  const row = await context.env.DB.prepare(`SELECT * FROM job_financials WHERE project_id=?1`).bind(id).first();
  await recordActivity(context.env.DB, {
    entityType: "project", entityId: id, action: "financials-updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { price_cents: price, profit_cents: price - (m.v + s.v + t.v + l.v + misc) },
  }).catch(() => {});
  return json({ financials: { ...resolveFinancials(dp, row), default_price_cents: dp } });
}
