import { requireAuth, json } from "../../_lib/auth.js";
import { contractTotalSql, finalDiscountSql } from "../../_lib/job-total.js";
import { wallPaintSql } from "../../_lib/painter.js";

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
                    ${wallPaintSql("p")} AS wall_paint,
                    (SELECT COALESCE(SUM(iv.amount_cents), 0) FROM invoices iv
                      WHERE iv.project_id = p.id AND iv.status = 'paid') AS paid_cents,
                    ${finalDiscountSql()} AS final_discount
             FROM projects p JOIN contacts c ON c.id = p.contact_id WHERE 1=1`;
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

  // The job's value is what the customer pays: the signed contracts less any
  // final-payment discount. (No cost or profit figures since 2026-10-21, Michael.)
  for (const r of rows) {
    if (r.job_total_cents != null) r.job_total_cents = Math.max(0, r.job_total_cents - (r.final_discount || 0));
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
