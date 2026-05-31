import { requireAuth, json } from "../../_lib/auth.js";

const ALLOWED_STATUSES = new Set([
  "new",
  "replied",
  "consult",
  "proposal",
  "booked",
  "installed",
  "lost",
]);

export async function onRequestGet(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

  const where = [];
  const binds = [];
  if (status && ALLOWED_STATUSES.has(status)) {
    where.push(`status = ?${binds.length + 1}`);
    binds.push(status);
  } else {
    // Default view hides terminal "now a job" statuses — once a contract is
    // signed the lead becomes a Job and lives on /crm/project.html. The lead
    // row stays in D1 for history/attribution but is filtered out of the
    // active Leads list and Pipeline kanban by default. Caller can opt-in
    // to see them via ?status=booked or ?include_archived=1.
    const includeArchived = url.searchParams.get("include_archived") === "1";
    if (!includeArchived) {
      where.push(`status NOT IN ('booked', 'installed')`);
    }
  }
  if (search) {
    const like = `%${search}%`;
    const i = binds.length + 1;
    where.push(`(name LIKE ?${i} OR email LIKE ?${i + 1} OR phone LIKE ?${i + 2} OR location LIKE ?${i + 3})`);
    binds.push(like, like, like, like);
  }

  const sql = `
    SELECT id, created_at, updated_at, name, phone, email,
           address_street, address_city, address_state, address_zip, location,
           interest, message, source_page, status, assigned_to, quoted_amount_cents
    FROM leads
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY datetime(created_at) DESC
    LIMIT ${limit}
  `;
  const stmt = binds.length ? context.env.DB.prepare(sql).bind(...binds) : context.env.DB.prepare(sql);
  const { results } = await stmt.all();

  // Quick counts by status for the sidebar
  const counts = await context.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM leads GROUP BY status`
  ).all();
  const byStatus = Object.fromEntries((counts.results || []).map((r) => [r.status, r.n]));

  return json({ leads: results, counts: byStatus });
}
