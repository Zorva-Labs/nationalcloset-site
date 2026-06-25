// GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&all=0|1
//   Aggregates gross income (revenue) and a full P&L (revenue − materials −
//   shipping − tax − labor − misc = profit) across jobs in the date range.
//   By default only "won" jobs (booked → completed) are counted; all=1 includes
//   every project. Each job's numbers come from its saved overrides where set,
//   otherwise from the cost formula applied to its contract/proposal total.
import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials } from "../../_lib/financials.js";

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
            jf.labor_cents, jf.misc_cents, jf.price_auto, jf.materials_auto, jf.shipping_auto, jf.tax_auto, jf.labor_auto,
            (SELECT k.total_cents FROM contracts k WHERE k.project_id=p.id
               ORDER BY CASE k.status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END,
                        datetime(k.created_at) DESC LIMIT 1) AS contract_total,
            (SELECT pr.selected_total_cents FROM proposals pr WHERE pr.project_id=p.id AND pr.status='accepted'
               ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS accepted_total
       FROM projects p
       LEFT JOIN contacts c ON c.id = p.contact_id
       LEFT JOIN job_financials jf ON jf.project_id = p.id
      WHERE date(p.created_at) BETWEEN ?1 AND ?2 ${statusClause}
      ORDER BY datetime(p.created_at) DESC`
  ).bind(...binds).all()).results || [];

  const jobs = [];
  const totals = { revenue: 0, materials: 0, shipping: 0, tax: 0, labor: 0, misc: 0, expenses: 0, profit: 0 };

  for (const r of rows) {
    const defaultPrice = r.contract_total || r.accepted_total || 0;
    // A job_financials row exists iff its columns came back non-null.
    const hasRow = r.price_cents != null;
    const fin = resolveFinancials(defaultPrice, hasRow ? r : null);
    jobs.push({
      id: r.id, name: r.name, contact_name: r.contact_name, status: r.status, created_at: r.created_at,
      price_cents: fin.price_cents, materials_cents: fin.materials_cents, shipping_cents: fin.shipping_cents,
      tax_cents: fin.tax_cents, labor_cents: fin.labor_cents, misc_cents: fin.misc_cents,
      expenses_cents: fin.expenses_cents, profit_cents: fin.profit_cents,
    });
    totals.revenue += fin.price_cents; totals.materials += fin.materials_cents; totals.shipping += fin.shipping_cents;
    totals.tax += fin.tax_cents; totals.labor += fin.labor_cents; totals.misc += fin.misc_cents;
    totals.expenses += fin.expenses_cents; totals.profit += fin.profit_cents;
  }

  return json({ from, to, all: includeAll, count: jobs.length, totals, jobs });
}
