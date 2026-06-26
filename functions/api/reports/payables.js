// GET /api/reports/payables?as_of=YYYY-MM-DD
//   Accounts Payable + A/P Aging from unpaid bill balances (expenses table).
//   A bill is outstanding when it isn't void and balance (amount − paid) > 0.
//   Aged from the due date (or bill date if none) to the "as of" date.
import { requireAuth, json } from "../../_lib/auth.js";

const DAY = 86400000;

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  let asOf = (url.searchParams.get("as_of") || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > today) asOf = today;
  const asOfMs = Date.parse(asOf + "T00:00:00Z");

  const rows = (await context.env.DB.prepare(
    `SELECT e.id, e.vendor, e.description, e.category, e.amount_cents, e.amount_paid_cents,
            e.bill_date, e.due_date, e.created_at, e.project_id, p.name AS project_name
       FROM expenses e LEFT JOIN projects p ON p.id = e.project_id
      WHERE e.status != 'void'
        AND (e.amount_cents - COALESCE(e.amount_paid_cents, 0)) > 0
        AND COALESCE(e.bill_date, date(e.created_at)) <= ?1`
  ).bind(asOf).all()).results || [];

  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  const byCategory = {};
  const bills = [];
  let total = 0, overdue = 0, oldest = 0;

  for (const r of rows) {
    const bal = (r.amount_cents || 0) - (r.amount_paid_cents || 0);
    if (bal <= 0) continue;
    const ref = (r.due_date || r.bill_date || r.created_at || asOf).slice(0, 10);
    const daysPast = Math.floor((asOfMs - Date.parse(ref + "T00:00:00Z")) / DAY);
    let bucket;
    if (daysPast <= 0) { bucket = "current"; buckets.current += bal; }
    else if (daysPast <= 30) { bucket = "d1_30"; buckets.d1_30 += bal; }
    else if (daysPast <= 60) { bucket = "d31_60"; buckets.d31_60 += bal; }
    else if (daysPast <= 90) { bucket = "d61_90"; buckets.d61_90 += bal; }
    else { bucket = "d90"; buckets.d90 += bal; }
    total += bal;
    if (daysPast > 0) overdue += bal;
    if (daysPast > oldest) oldest = daysPast;
    const cat = r.category || "Uncategorized";
    byCategory[cat] = (byCategory[cat] || 0) + bal;
    bills.push({
      id: r.id, vendor: r.vendor, description: r.description, category: r.category,
      project_name: r.project_name, project_id: r.project_id,
      amount_cents: r.amount_cents, paid_cents: r.amount_paid_cents || 0, balance_cents: bal,
      due_date: r.due_date, days_past: daysPast, bucket,
    });
  }
  bills.sort((a, b) => b.days_past - a.days_past || b.balance_cents - a.balance_cents);
  const categories = Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);

  return json({ as_of: asOf, total_cents: total, overdue_cents: overdue, count: bills.length, oldest_days: oldest, buckets, categories, bills });
}
