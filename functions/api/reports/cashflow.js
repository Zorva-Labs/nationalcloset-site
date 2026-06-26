// GET /api/reports/cashflow?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Cash IN (customer payments → invoice_payments) and cash OUT (bill payments →
//   expense_payments) over the range, with a per-month breakdown and a category
//   split of spending. Also returns est_costs — the P&L formula's modeled job
//   costs for won jobs in the range — as a comparison until bills are logged.
import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials } from "../../_lib/financials.js";

const WON = ["contracted", "scheduled_install", "installing", "completed"];

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const from = (url.searchParams.get("from") || "2000-01-01").slice(0, 10);
  const to = (url.searchParams.get("to") || "2999-12-31").slice(0, 10);

  const inRows = (await context.env.DB.prepare(
    `SELECT strftime('%Y-%m', paid_at) AS m, COALESCE(SUM(amount_cents),0) AS c FROM invoice_payments WHERE date(paid_at) BETWEEN ?1 AND ?2 GROUP BY m`
  ).bind(from, to).all()).results || [];
  const outRows = (await context.env.DB.prepare(
    `SELECT strftime('%Y-%m', paid_at) AS m, COALESCE(SUM(amount_cents),0) AS c FROM expense_payments WHERE date(paid_at) BETWEEN ?1 AND ?2 GROUP BY m`
  ).bind(from, to).all()).results || [];

  const inByMonth = Object.fromEntries(inRows.map((r) => [r.m, r.c]));
  const outByMonth = Object.fromEntries(outRows.map((r) => [r.m, r.c]));
  const months = [...new Set([...Object.keys(inByMonth), ...Object.keys(outByMonth)])].sort();
  const by_month = months.map((m) => { const ci = inByMonth[m] || 0, co = outByMonth[m] || 0; return { month: m, cash_in: ci, cash_out: co, net: ci - co }; });
  const cash_in = by_month.reduce((a, x) => a + x.cash_in, 0);
  const cash_out = by_month.reduce((a, x) => a + x.cash_out, 0);

  const catRows = (await context.env.DB.prepare(
    `SELECT COALESCE(e.category, 'Uncategorized') AS cat, COALESCE(SUM(ep.amount_cents),0) AS c
       FROM expense_payments ep JOIN expenses e ON e.id = ep.expense_id
      WHERE date(ep.paid_at) BETWEEN ?1 AND ?2 GROUP BY cat ORDER BY c DESC`
  ).bind(from, to).all()).results || [];
  const out_by_category = catRows.map((r) => ({ category: r.cat, amount: r.c }));

  // Modeled job costs (formula) for won jobs created in range — comparison only.
  const jobRows = (await context.env.DB.prepare(
    `SELECT jf.price_cents, jf.discount_cents, jf.materials_cents, jf.shipping_cents, jf.tax_cents, jf.labor_cents, jf.misc_cents,
            jf.price_auto, jf.discount_auto, jf.materials_auto, jf.shipping_auto, jf.tax_auto, jf.labor_auto,
            (SELECT k.total_cents FROM contracts k WHERE k.project_id=p.id
               ORDER BY CASE k.status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END, datetime(k.created_at) DESC LIMIT 1) AS contract_total,
            (SELECT t.subtotal_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_gross,
            (SELECT t.total_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_net
       FROM projects p LEFT JOIN job_financials jf ON jf.project_id = p.id
      WHERE p.status IN (${WON.map(() => "?").join(",")}) AND date(p.created_at) BETWEEN ? AND ?`
  ).bind(...WON, from, to).all()).results || [];
  let est_costs = 0;
  for (const r of jobRows) {
    let gross, discount;
    if (r.tier_gross != null || r.tier_net != null) { const s = r.tier_gross || 0, t = r.tier_net || 0; if (s > t) { gross = s; discount = s - t; } else { gross = t || s; discount = 0; } }
    else { gross = r.contract_total || 0; discount = 0; }
    const fin = resolveFinancials(gross, discount, r.price_cents != null ? r : null);
    est_costs += fin.expenses_cents;
  }

  return json({ from, to, cash_in, cash_out, net: cash_in - cash_out, by_month, out_by_category, est_costs });
}
