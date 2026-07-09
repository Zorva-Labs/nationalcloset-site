// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&all=0|1
//   Aggregates gross income (revenue) and a full P&L (revenue − materials −
//   shipping − tax − labor − misc = profit) across jobs in the date range.
//   By default only "won" jobs (booked → completed) are counted; all=1 includes
//   every project. Each job's numbers come from its saved overrides where set,
//   otherwise from the cost formula applied to its contract/proposal total.
import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials, processingFee } from "../../_lib/financials.js";

const WON = ["contracted", "scheduled_install", "installing", "completed"];

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const from = (url.searchParams.get("from") || "2000-01-01").slice(0, 10);
  const to = (url.searchParams.get("to") || "2999-12-31").slice(0, 10);
  const includeAll = url.searchParams.get("all") === "1";

  const statusClause = includeAll ? "" : `AND p.status IN (${WON.map(() => "?").join(",")})`;
  const binds = [from, to, ...(includeAll ? [] : WON)];

  const rows = (await context.env.DB.prepare(
    `SELECT p.id, p.name, p.status, p.created_at, c.name AS contact_name,
            jf.price_cents, jf.discount_pct, jf.materials_cents, jf.shipping_cents, jf.tax_cents,
            jf.labor_cents, jf.misc_cents, jf.discount_cents, jf.price_auto, jf.discount_auto,
            jf.materials_auto, jf.shipping_auto, jf.tax_auto, jf.labor_auto,
            (SELECT k.total_cents FROM contracts k WHERE k.project_id=p.id
               ORDER BY CASE k.status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
                        datetime(k.created_at) DESC LIMIT 1) AS contract_total,
            (SELECT t.subtotal_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_gross,
            (SELECT t.total_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_net,
            (SELECT COALESCE(SUM(iv.fee_cents),0) FROM invoices iv WHERE iv.project_id=p.id AND iv.status='paid') AS fee_cents
       FROM projects p
       LEFT JOIN contacts c ON c.id = p.contact_id
       LEFT JOIN job_financials jf ON jf.project_id = p.id
      WHERE date(p.created_at) BETWEEN ?1 AND ?2 ${statusClause}
      ORDER BY datetime(p.created_at) DESC`
  ).bind(...binds).all()).results || [];

  const jobs = [];
  const totals = { gross: 0, discounts: 0, revenue: 0, materials: 0, shipping: 0, tax: 0, labor: 0, misc: 0, fee: 0, expenses: 0, profit: 0 };

  for (const r of rows) {
    // Cost basis is the pre-discount gross; revenue is the net the client pays.
    // A discount makes net < gross (tier total < subtotal). Older tiers stored a
    // with-tax total > pre-tax subtotal — that's not a discount, so use total.
    let gross, net, discount;
    if (r.tier_gross != null || r.tier_net != null) {
      const sub = r.tier_gross || 0, tot = r.tier_net || 0;
      if (sub > tot) { gross = sub; net = tot; discount = sub - tot; }
      else { gross = tot || sub; net = gross; discount = 0; }
    } else {
      gross = r.contract_total || 0; net = gross; discount = 0;
    }
    // A job_financials row exists iff its columns came back non-null.
    const hasRow = r.price_cents != null;
    const fin = resolveFinancials(gross, discount, hasRow ? r : null);
    // Processing fee: actual Stripe fees (card/Klarna) when collected, else the
    // estimate (fee_rate × net, default 3%). Folded into expenses & profit.
    const fee = processingFee(fin.net_cents, fin.fee_rate, r.fee_cents);
    const expenses = fin.expenses_cents + fee;
    const profit = fin.profit_cents - fee;
    jobs.push({
      id: r.id, name: r.name, contact_name: r.contact_name, status: r.status, created_at: r.created_at,
      price_cents: fin.net_cents, gross_cents: fin.price_cents, discount_cents: fin.discount_cents,
      materials_cents: fin.materials_cents, shipping_cents: fin.shipping_cents,
      tax_cents: fin.tax_cents, labor_cents: fin.labor_cents, misc_cents: fin.misc_cents, fee_cents: fee,
      expenses_cents: expenses, profit_cents: profit,
    });
    totals.gross += fin.price_cents; totals.discounts += fin.discount_cents; totals.revenue += fin.net_cents;
    totals.materials += fin.materials_cents; totals.shipping += fin.shipping_cents;
    totals.tax += fin.tax_cents; totals.labor += fin.labor_cents; totals.misc += fin.misc_cents; totals.fee += fee;
    totals.expenses += expenses; totals.profit += profit;
  }

  return json({ from, to, all: includeAll, count: jobs.length, totals, jobs });
}
