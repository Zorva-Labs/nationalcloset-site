import { requireAuth, json } from "../../_lib/auth.js";
import { resolveFinancials } from "../../_lib/financials.js";

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

  // job_total_cents = the dollar value of the job, taken from its most
  // authoritative contract (executed > signed > sent > latest draft).
  let sql = `SELECT p.*,
                    c.name  AS contact_name,
                    c.email AS contact_email,
                    c.phone AS contact_phone,
                    c.address_city AS contact_city,
                    (SELECT k.total_cents FROM contracts k
                      WHERE k.project_id = p.id
                      ORDER BY CASE k.status
                                 WHEN 'fully_executed'    THEN 0
                                 WHEN 'signed_by_customer' THEN 1
                                 WHEN 'sent'              THEN 2
                                 ELSE 3 END,
                               datetime(k.created_at) DESC
                      LIMIT 1) AS job_total_cents,
                    (SELECT COALESCE(SUM(iv.amount_cents), 0) FROM invoices iv
                      WHERE iv.project_id = p.id AND iv.status = 'paid') AS paid_cents,
                    jf.price_cents AS jf_price_cents, jf.discount_cents AS jf_discount_cents,
                    jf.materials_cents AS jf_materials_cents, jf.shipping_cents AS jf_shipping_cents,
                    jf.tax_cents AS jf_tax_cents, jf.labor_cents AS jf_labor_cents, jf.misc_cents AS jf_misc_cents,
                    jf.price_auto AS jf_price_auto, jf.discount_auto AS jf_discount_auto,
                    jf.materials_auto AS jf_materials_auto, jf.shipping_auto AS jf_shipping_auto,
                    jf.tax_auto AS jf_tax_auto, jf.labor_auto AS jf_labor_auto,
                    (SELECT t.subtotal_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
                       WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_gross,
                    (SELECT t.total_cents FROM proposals pr JOIN proposal_tiers t ON t.proposal_id=pr.id AND t.tier=pr.selected_tier
                       WHERE pr.project_id=p.id AND pr.status='accepted' ORDER BY datetime(pr.created_at) DESC LIMIT 1) AS tier_net
             FROM projects p JOIN contacts c ON c.id = p.contact_id
             LEFT JOIN job_financials jf ON jf.project_id = p.id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND p.status=?${binds.length}`; }
  if (contactId) { binds.push(parseInt(contactId, 10)); sql += ` AND p.contact_id=?${binds.length}`; }
  sql += ` ORDER BY p.updated_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];

  // Net profit per job — cost basis is the pre-discount gross (accepted tier
  // subtotal, else contract total); discount comes off profit. Mirrors the job
  // Expenses card and Reports so the numbers line up.
  for (const r of rows) {
    let gross, discount;
    if (r.tier_gross != null || r.tier_net != null) {
      const s = r.tier_gross || 0, t = r.tier_net || 0;
      if (s > t) { gross = s; discount = s - t; } else { gross = t || s; discount = 0; }
    } else { gross = r.job_total_cents || 0; discount = 0; }
    const jfRow = r.jf_price_cents != null ? {
      price_cents: r.jf_price_cents, discount_cents: r.jf_discount_cents,
      materials_cents: r.jf_materials_cents, shipping_cents: r.jf_shipping_cents, tax_cents: r.jf_tax_cents,
      labor_cents: r.jf_labor_cents, misc_cents: r.jf_misc_cents,
      price_auto: r.jf_price_auto, discount_auto: r.jf_discount_auto, materials_auto: r.jf_materials_auto,
      shipping_auto: r.jf_shipping_auto, tax_auto: r.jf_tax_auto, labor_auto: r.jf_labor_auto,
    } : null;
    r.net_profit_cents = gross ? resolveFinancials(gross, discount, jfRow).profit_cents : null;
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
