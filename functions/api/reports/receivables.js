// GET /api/reports/receivables?as_of=YYYY-MM-DD
//   Accounts Receivable + A/R Aging from open invoice balances. An invoice is
//   "outstanding" when it isn't void and its balance (amount − amount_paid) > 0.
//   Aging is measured from the due date (or, if none, the invoice date) to the
//   "as of" date, bucketed Current / 1–30 / 31–60 / 61–90 / 90+ days past due.
import { requireAuth, json } from "../../_lib/auth.js";

const DAY = 86400000;

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  let asOf = (url.searchParams.get("as_of") || "").slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || asOf > today) asOf = today; // never age into the future
  const asOfMs = Date.parse(asOf + "T00:00:00Z");

  const rows = (await context.env.DB.prepare(
    `SELECT i.id, i.number, i.type, i.amount_cents, i.amount_paid_cents, i.status, i.due_date, i.created_at,
            i.project_id, c.name AS contact_name, p.name AS project_name
       FROM invoices i
       LEFT JOIN contacts c ON c.id = i.contact_id
       LEFT JOIN projects p ON p.id = i.project_id
      WHERE i.status != 'void'
        AND (i.amount_cents - COALESCE(i.amount_paid_cents, 0)) > 0
        AND date(i.created_at) <= ?1`
  ).bind(asOf).all()).results || [];

  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 };
  const invoices = [];
  let total = 0, overdue = 0, oldest = 0;

  for (const r of rows) {
    const bal = (r.amount_cents || 0) - (r.amount_paid_cents || 0);
    if (bal <= 0) continue;
    const ref = (r.due_date || r.created_at || asOf).slice(0, 10);
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
    invoices.push({
      id: r.id, number: r.number, type: r.type,
      contact_name: r.contact_name, project_name: r.project_name, project_id: r.project_id,
      amount_cents: r.amount_cents, paid_cents: r.amount_paid_cents || 0, balance_cents: bal,
      due_date: r.due_date, ref_date: ref, days_past: daysPast, bucket,
    });
  }
  invoices.sort((a, b) => b.days_past - a.days_past || b.balance_cents - a.balance_cents);

  return json({ as_of: asOf, total_cents: total, overdue_cents: overdue, count: invoices.length, oldest_days: oldest, buckets, invoices });
}
