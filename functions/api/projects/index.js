import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials, processingFee } from "../../_lib/financials.js";
import { contractTotalSql, acceptedTierSql, finalDiscountSql, costBasis } from "../../_lib/job-total.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const contactId = url.searchParams.get("contact_id");
  const countsOnly = url.searchParams.get("counts_only") === "1";

  // Sidebar drill-down only needs count badges. Short-circuit to a cheap
  // GROUP BY when ?counts_only=1 — no need to load full project rows.
  if (countsOnly) {
    const rows = (await context.env.DB.prepare(
      `SELECT status, COUNT(*) AS n FROM projects GROUP BY status`
    ).all()).results || [];
    const counts = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    return json({ counts });
  }

  // job_total_cents = the dollar value of the job: every signed contract once
  // (_lib/job-total.js), else its most authoritative contract.
  let sql = `SELECT p.*,
                    c.name  AS contact_name,
                    c.email AS contact_email,
                    c.phone AS contact_phone,
                    c.address_city AS contact_city,
                    ${contractTotalSql()} AS job_total_cents,
                    (SELECT COALESCE(SUM(iv.amount_cents), 0) FROM invoices iv
                      WHERE iv.project_id = p.id AND iv.status = 'paid') AS paid_cents,
                    (SELECT COALESCE(SUM(iv.fee_cents), 0) FROM invoices iv
                      WHERE iv.project_id = p.id AND iv.status = 'paid') AS fee_cents,
                    jf.price_cents AS jf_price_cents, jf.discount_cents AS jf_discount_cents,
                    jf.materials_cents AS jf_materials_cents, jf.shipping_cents AS jf_shipping_cents,
                    jf.tax_cents AS jf_tax_cents, jf.labor_cents AS jf_labor_cents, jf.misc_cents AS jf_misc_cents,
                    jf.price_auto AS jf_price_auto, jf.discount_auto AS jf_discount_auto,
                    jf.materials_auto AS jf_materials_auto, jf.shipping_auto AS jf_shipping_auto,
                    jf.tax_auto AS jf_tax_auto, jf.labor_auto AS jf_labor_auto,
                    jf.materials_divisor AS jf_materials_divisor, jf.shipping_rate AS jf_shipping_rate,
                    jf.tax_rate AS jf_tax_rate, jf.labor_rate AS jf_labor_rate, jf.fee_rate AS jf_fee_rate,
                    jf.fee_cents AS jf_fee_cents, jf.fee_auto AS jf_fee_auto, jf.wall_total_cents AS jf_wall_total_cents,
                    ${acceptedTierSql("subtotal_cents")} AS tier_gross,
                    ${acceptedTierSql("total_cents")} AS tier_net,
                    ${finalDiscountSql()} AS final_discount
             FROM projects p JOIN contacts c ON c.id = p.contact_id
             LEFT JOIN job_financials jf ON jf.project_id = p.id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND p.status=?${binds.length}`; }
  else if (url.searchParams.get("include_completed") !== "1") {
    // Default Jobs list hides completed jobs — they live under the Completed
    // category (?status=completed). Any explicit status filter still shows them.
    sql += ` AND p.status != 'completed'`;
  }
  if (contactId) { binds.push(parseInt(contactId, 10)); sql += ` AND p.contact_id=?${binds.length}`; }
  sql += ` ORDER BY p.updated_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  // Net profit per job — cost basis is the pre-discount gross (accepted tier
  // subtotal, else contract total); discount comes off profit. Mirrors the job
  // Expenses card and Reports so the numbers line up.
  for (const r of rows) {
    const { gross, discount } = costBasis(r.tier_gross, r.tier_net, r.job_total_cents, r.final_discount);
    // The job's value is what the customer pays: the signed contracts less any
    // final-payment discount.
    if (r.job_total_cents != null) r.job_total_cents = Math.max(0, r.job_total_cents - (r.final_discount || 0));
    const jfRow = r.jf_price_cents != null ? {
      price_cents: r.jf_price_cents, discount_cents: r.jf_discount_cents,
      materials_cents: r.jf_materials_cents, shipping_cents: r.jf_shipping_cents, tax_cents: r.jf_tax_cents,
      labor_cents: r.jf_labor_cents, misc_cents: r.jf_misc_cents,
      price_auto: r.jf_price_auto, discount_auto: r.jf_discount_auto, materials_auto: r.jf_materials_auto,
      shipping_auto: r.jf_shipping_auto, tax_auto: r.jf_tax_auto, labor_auto: r.jf_labor_auto,
      materials_divisor: r.jf_materials_divisor, shipping_rate: r.jf_shipping_rate,
      tax_rate: r.jf_tax_rate, labor_rate: r.jf_labor_rate, fee_rate: r.jf_fee_rate,
      fee_cents: r.jf_fee_cents, fee_auto: r.jf_fee_auto, wall_total_cents: r.jf_wall_total_cents,
    } : null;
    if (gross) {
      const fin = resolveFinancials(gross, discount, jfRow);
      const fee = processingFee(fin.net_cents, fin.fee_rate, r.fee_cents, fin.fee_manual_cents, fin.fee_auto === false ? 0 : 1);
      r.net_profit_cents = fin.profit_cents - fee;
      r.labor_cents = fin.labor_cents;
    } else { r.net_profit_cents = null; r.labor_cents = null; }
  }

  // Always include the counts map so the list page can show filter badges.
  const allCountsRows = (await context.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM projects GROUP BY status`
  ).all()).results || [];
  const counts = Object.fromEntries(allCountsRows.map((r) => [r.status, r.n]));

  return json({ projects: rows, counts });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.contact_id || !body.name) return json({ error: "Missing contact_id or name" }, 400);
  const r = await context.env.DB
    .prepare(`INSERT INTO projects (contact_id, name, description, site_address)
              VALUES (?1,?2,?3,?4) RETURNING id`)
    .bind(body.contact_id, body.name, body.description || null, body.site_address || null)
    .first();
  return json({ id: r.id });
}
