// GET /api/reports/payables?as_of=YYYY-MM-DD
//   Accounts Payable + A/P Aging from unpaid bill balances (expenses table).
//   A bill is outstanding when it isn't void and balance (amount − paid) > 0.
//   Aged from the due date (or bill date if none) to the "as of" date.
import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials } from "../../_lib/financials.js";

const DAY = 86400000;
const WON = ["contracted", "scheduled_install", "installing", "completed"];

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

  // Estimated LABOR payable (modeled). Materials, taxes & shipping are paid up
  // front (when the job is ordered), so they're NOT outstanding payables. The
  // installer's labor becomes payable AFTER the job is completed — so a
  // completed job that hasn't yet had a real installer bill logged is an
  // estimated payable. In-progress jobs are an upcoming commitment, not yet due.
  // Each job carries its assigned installer (labor) + manufacturer (materials).
  const jobRows = (await context.env.DB.prepare(
    `SELECT p.id, p.name, p.status,
            jf.price_cents, jf.discount_cents, jf.materials_cents, jf.shipping_cents, jf.tax_cents, jf.labor_cents, jf.misc_cents,
            jf.price_auto, jf.discount_auto, jf.materials_auto, jf.shipping_auto, jf.tax_auto, jf.labor_auto,
            (SELECT k.total_cents FROM contracts k WHERE k.project_id=p.id
               ORDER BY CASE k.status WHEN 'fully_executed' THEN 0 WHEN 'signed_by_customer' THEN 1 WHEN 'sent' THEN 2 ELSE 3 END, datetime(k.created_at) DESC LIMIT 1) AS contract_total,
            (SELECT t.subtotal_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_gross,
            (SELECT t.total_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
               WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_net,
            (SELECT v.name FROM project_vendors pv JOIN vendors v ON v.id=pv.vendor_id WHERE pv.project_id=p.id AND pv.role='installer') AS installer_name,
            (SELECT pv.vendor_id FROM project_vendors pv WHERE pv.project_id=p.id AND pv.role='installer') AS installer_id,
            (SELECT v.name FROM project_vendors pv JOIN vendors v ON v.id=pv.vendor_id WHERE pv.project_id=p.id AND pv.role='manufacturer') AS manufacturer_name
       FROM projects p LEFT JOIN job_financials jf ON jf.project_id = p.id
      WHERE p.status IN (${WON.map(() => "?").join(",")})`
  ).bind(...WON).all()).results || [];
  const est_jobs = [];
  let est_labor_total = 0, est_labor_upcoming = 0, est_upfront_total = 0;
  for (const r of jobRows) {
    let gross, discount;
    if (r.tier_gross != null || r.tier_net != null) { const s = r.tier_gross || 0, t = r.tier_net || 0; if (s > t) { gross = s; discount = s - t; } else { gross = t || s; discount = 0; } }
    else { gross = r.contract_total || 0; discount = 0; }
    if (!gross) continue;
    const fin = resolveFinancials(gross, discount, r.price_cents != null ? r : null);
    const upfront = fin.materials_cents + fin.shipping_cents + fin.tax_cents;          // paid up front
    const completed = r.status === "completed";

    // Has the installer's labor already been logged as a real bill? If so, the
    // logged bill (in the A/P list above) carries it — don't double-count via
    // the estimate. We match an installer bill by the assigned installer vendor.
    let installerBilled = false;
    if (r.installer_id) {
      const b = await context.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM expenses WHERE project_id=?1 AND vendor_id=?2 AND status!='void'`
      ).bind(r.id, r.installer_id).first().catch(() => null);
      installerBilled = (b?.n || 0) > 0;
    }

    const laborOwed = (completed && !installerBilled) ? fin.labor_cents : 0;            // payable after completion, until billed
    const laborUpcoming = (!completed) ? fin.labor_cents : 0;                           // future commitment, not yet due
    est_jobs.push({
      project_id: r.id, name: r.name, status: r.status,
      installer_name: r.installer_name || null, manufacturer_name: r.manufacturer_name || null,
      labor_cents: fin.labor_cents, labor_owed_cents: laborOwed, labor_upcoming_cents: laborUpcoming,
      installer_billed: installerBilled, upfront_cents: upfront,
    });
    est_labor_total += laborOwed;
    est_labor_upcoming += laborUpcoming;
    est_upfront_total += upfront;
  }
  est_jobs.sort((a, b) => b.labor_owed_cents - a.labor_owed_cents || b.labor_upcoming_cents - a.labor_upcoming_cents);

  return json({
    as_of: asOf, total_cents: total, overdue_cents: overdue, count: bills.length, oldest_days: oldest, buckets, categories, bills,
    est_jobs, est_labor_total, est_labor_upcoming, est_upfront_total,
    grand_payable_cents: total + est_labor_total,
  });
}
