// GET  /api/projects/[id]/financials  — cost breakdown + profit for one job
// PUT  /api/projects/[id]/financials  — save price/discount/expense overrides
//
// The cost basis is the GROSS (pre-discount) price; expenses auto-derive from
// it (see _lib/financials.js). A discount comes out of profit only — the client
// pays NET = gross − discount, profit = net − expenses. Gross + discount default
// from the accepted proposal's selected tier; any line can be overridden.
import { requireAuth, json } from "../../../_lib/auth.js";
import { getProjectBilling } from "../../../_lib/invoices.js";
import { resolveFinancials, computeBreakdown } from "../../../_lib/financials.js";
import { recordActivity } from "../../../_lib/db.js";

// Gross (pre-discount) cost basis + dollar discount for a job. Prefer the
// accepted proposal's selected tier (subtotal = gross, total = net); fall back
// to the contract/proposal total with no discount.
async function defaultBasis(env, projectId) {
  const tier = await env.DB.prepare(
    `SELECT t.subtotal_cents AS gross, t.total_cents AS net
       FROM proposals p JOIN proposal_tiers t ON t.proposal_id = p.id AND t.tier = p.selected_tier
      WHERE p.project_id = ?1 AND p.status = 'accepted'
      ORDER BY datetime(p.created_at) DESC LIMIT 1`
  ).bind(projectId).first().catch(() => null);
  if (tier && (tier.gross || tier.net)) {
    const sub = tier.gross || 0, tot = tier.net || 0;
    // A discount makes net (total) LESS than gross (subtotal). If total >= subtotal
    // there's no discount — total is the real client price (older tiers stored a
    // with-tax total > pre-tax subtotal; treat total as the basis).
    if (sub > tot) return { grossCents: sub, discountCents: sub - tot };
    return { grossCents: tot || sub, discountCents: 0 };
  }
  const b = await getProjectBilling(env.DB, projectId).catch(() => null);
  return { grossCents: b?.totalCents || 0, discountCents: 0 };
}

// Actual Stripe processing fees already collected on this project's paid
// invoices (card + Klarna carry a real fee; ACH is small; check/cash $0).
async function projectFeeCents(env, projectId) {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(fee_cents),0) AS fee FROM invoices WHERE project_id=?1 AND status='paid'`
  ).bind(projectId).first().catch(() => null);
  return r?.fee || 0;
}
// Fold the processing fee into the financials as a cost line that reduces profit.
function withFee(fin, feeCents) {
  const fee = feeCents || 0;
  return { ...fin, processing_fee_cents: fee, expenses_cents: (fin.expenses_cents || 0) + fee, profit_cents: (fin.profit_cents || 0) - fee };
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const row = await context.env.DB.prepare(`SELECT * FROM job_financials WHERE project_id=?1`).bind(id).first().catch(() => null);
  const b = await defaultBasis(context.env, id);
  const fee = await projectFeeCents(context.env, id);
  const fin = withFee(resolveFinancials(b.grossCents, b.discountCents, row), fee);
  return json({ financials: { ...fin, default_price_cents: b.grossCents, default_discount_cents: b.discountCents } });
}

export async function onRequestPut(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const b = await defaultBasis(context.env, id);

  const cents = (v) => Math.max(0, Math.round(Number(v) || 0));

  // Gross price: manual override if a value is sent AND price_auto is not true.
  const priceOverride = body.price_cents != null && body.price_auto !== true;
  const price = priceOverride ? cents(body.price_cents) : b.grossCents;
  const f = computeBreakdown(price);

  // Discount: manual override if discount_auto is explicitly false.
  const discountOverride = body.discount_auto === false;
  const discount = discountOverride ? cents(body.discount_cents) : b.discountCents;

  // Each expense line: auto (use formula) unless the client flags it manual.
  // Materials = price ÷ 2.8; labor = 15% of the gross price. Shipping & tax are
  // folded into the price (2.8×), so they're always 0 (kept for schema/back-compat).
  const m = (body.materials_auto === false) ? { v: cents(body.materials_cents), a: 0 } : { v: f.materials, a: 1 };
  const s = { v: 0, a: 1 };
  const t = { v: 0, a: 1 };
  const l = (body.labor_auto === false) ? { v: cents(body.labor_cents), a: 0 } : { v: f.labor, a: 1 };
  const misc = cents(body.misc_cents);

  await context.env.DB.prepare(
    `INSERT INTO job_financials
       (project_id, price_cents, discount_pct, materials_cents, shipping_cents, tax_cents, labor_cents, misc_cents,
        discount_cents, price_auto, discount_auto, materials_auto, shipping_auto, tax_auto, labor_auto, notes, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET
       price_cents=?2, discount_pct=?3, materials_cents=?4, shipping_cents=?5, tax_cents=?6, labor_cents=?7,
       misc_cents=?8, discount_cents=?9, price_auto=?10, discount_auto=?11, materials_auto=?12, shipping_auto=?13,
       tax_auto=?14, labor_auto=?15, notes=?16, updated_at=datetime('now')`
  ).bind(
    id, price, 0, m.v, s.v, t.v, l.v, misc, discount,
    priceOverride ? 0 : 1, discountOverride ? 0 : 1, m.a, s.a, t.a, l.a, (body.notes || null),
  ).run();

  const row = await context.env.DB.prepare(`SELECT * FROM job_financials WHERE project_id=?1`).bind(id).first();
  const fin = withFee(resolveFinancials(b.grossCents, b.discountCents, row), await projectFeeCents(context.env, id));
  await recordActivity(context.env.DB, {
    entityType: "project", entityId: id, action: "financials-updated",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
    details: { price_cents: price, discount_cents: discount, profit_cents: fin.profit_cents },
  }).catch(() => {});
  return json({ financials: { ...fin, default_price_cents: b.grossCents, default_discount_cents: b.discountCents } });
}
