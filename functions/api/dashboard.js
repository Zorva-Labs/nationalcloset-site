// GET /api/dashboard — aggregator for the home screen
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { DB } = context.env;
  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date(Date.now() + 7 * 86400 * 1000).toISOString().slice(0, 10);
  const monthStart = today.slice(0, 7) + "-01";

  // Pipeline value: sum of open estimates, proposals (selected tier), and contracts not lost
  const pipelineRow = await DB.prepare(`
    SELECT
      (SELECT COALESCE(SUM(total_cents), 0) FROM estimates WHERE status IN ('sent','viewed','approved')) AS estimate_pipeline,
      (SELECT COALESCE(SUM(COALESCE(selected_total_cents, 0)), 0) FROM proposals WHERE status IN ('sent','viewed','tier_selected','accepted')) AS proposal_pipeline,
      (SELECT COALESCE(SUM(total_cents), 0) FROM contracts WHERE status IN ('sent','signed_by_customer','fully_executed') AND deposit_paid = 0) AS contract_pipeline,
      (SELECT COALESCE(SUM(total_cents), 0) FROM contracts WHERE status = 'fully_executed' AND deposit_paid = 1) AS booked_value_total
  `).first();

  // This-month booked (fully_executed contracts created this month)
  const monthRow = await DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM leads WHERE created_at >= ?1) AS leads_this_month,
      (SELECT COUNT(*) FROM contracts WHERE counter_signed_at >= ?1) AS booked_this_month,
      (SELECT COALESCE(SUM(total_cents), 0) FROM contracts WHERE counter_signed_at >= ?1) AS booked_revenue_this_month
  `).bind(monthStart + "T00:00:00").first();

  // Upcoming appointments (next 7 days)
  const upcoming = (await DB.prepare(`
    SELECT a.id, a.start_at, a.end_at, a.type, a.status, a.name, a.site_address, a.rooms, c.id AS contact_id
    FROM appointments a
    LEFT JOIN contacts c ON c.id = a.contact_id
    WHERE a.start_at >= ?1 AND a.start_at < ?2 AND a.status IN ('pending','confirmed')
    ORDER BY a.start_at ASC LIMIT 10
  `).bind(today + "T00:00:00", weekAhead + "T23:59:59").all()).results || [];

  // Recent activity
  const activity = (await DB.prepare(`
    SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 12
  `).all()).results || [];

  // Pipeline distribution (count by project status)
  const dist = (await DB.prepare(`
    SELECT status, COUNT(*) AS n FROM projects GROUP BY status
  `).all()).results || [];

  // Needs-attention buckets
  const attention = await DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM estimates WHERE status = 'sent' AND view_count = 0 AND sent_at < datetime('now', '-3 days')) AS unviewed_estimates,
      (SELECT COUNT(*) FROM contracts WHERE status = 'signed_by_customer') AS awaiting_countersign,
      (SELECT COUNT(*) FROM proposals WHERE status IN ('sent','viewed') AND sent_at < datetime('now', '-5 days')) AS stale_proposals,
      (SELECT COUNT(*) FROM leads WHERE status = 'new' AND created_at < datetime('now', '-1 day')) AS untouched_leads
  `).first();

  return json({
    pipeline: {
      estimate_pipeline: pipelineRow.estimate_pipeline || 0,
      proposal_pipeline: pipelineRow.proposal_pipeline || 0,
      contract_pipeline: pipelineRow.contract_pipeline || 0,
      booked_value_total: pipelineRow.booked_value_total || 0,
      total: (pipelineRow.estimate_pipeline || 0) + (pipelineRow.proposal_pipeline || 0) + (pipelineRow.contract_pipeline || 0),
    },
    month: monthRow,
    distribution: dist,
    upcoming,
    activity,
    attention,
  });
}
