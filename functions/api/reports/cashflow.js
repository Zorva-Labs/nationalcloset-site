// GET /api/reports/cashflow?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Cash IN (customer payments → invoice_payments) and cash OUT (bill payments →
//   expense_payments) over the range, with a per-month breakdown and a category
//   split of spending. Real money only: no modeled job costs (2026-10-21, Michael).
import { requireAuth, json } from "../../_lib/auth.js";

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

  return json({ from, to, cash_in, cash_out, net: cash_in - cash_out, by_month, out_by_category });
}
