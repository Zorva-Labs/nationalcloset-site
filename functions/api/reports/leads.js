// GET /api/reports/leads?from=YYYY-MM-DD&to=YYYY-MM-DD
//   Lead funnel + conversion metrics over a date range (leads by created_at):
//   total leads, current-stage funnel (new → booked), conversion rate, lost,
//   proposals actually sent/accepted in the window, and a source breakdown.
import { requireAuth, json } from "../../_lib/auth.js";

// Forward progression of a lead. "booked" = won; "lost" is a terminal off-ramp.
const ORDER = ["new", "contacted", "replied", "consult", "proposal", "booked"];

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const from = (url.searchParams.get("from") || "2000-01-01").slice(0, 10);
  const to = (url.searchParams.get("to") || "2999-12-31").slice(0, 10);

  const leads = (await context.env.DB.prepare(
    `SELECT status, utm_source, source_page, referrer, quoted_amount_cents
       FROM leads WHERE date(created_at) BETWEEN ?1 AND ?2`
  ).bind(from, to).all()).results || [];

  const total = leads.length;
  const byStatus = {};
  let lost = 0, quoted = 0, quotedCount = 0;
  const srcMap = {};
  for (const l of leads) {
    byStatus[l.status] = (byStatus[l.status] || 0) + 1;
    if (l.status === "lost") lost++;
    if (l.quoted_amount_cents) { quoted += l.quoted_amount_cents; quotedCount++; }
    const s = l.utm_source || (l.referrer ? "Referral" : (l.source_page ? "Website form" : "Direct"));
    srcMap[s] = (srcMap[s] || 0) + 1;
  }
  // Cumulative funnel: a lead counts toward every stage at or before its current one.
  const reached = (minRank) => leads.filter((l) => ORDER.indexOf(l.status) >= minRank).length;
  const booked = byStatus["booked"] || 0;
  const funnel = {
    new: total,
    contacted: reached(1),
    replied: reached(2),
    consult: reached(3),
    proposal: reached(4),
    booked,
  };
  const sources = Object.entries(srcMap).map(([source, n]) => ({ source, n })).sort((a, b) => b.n - a.n);

  // Proposals actually sent / accepted in the window (independent of lead status).
  const propSent = (await context.env.DB.prepare(
    `SELECT COUNT(*) n FROM proposals WHERE sent_at IS NOT NULL AND date(sent_at) BETWEEN ?1 AND ?2`
  ).bind(from, to).first())?.n || 0;
  const propAccepted = (await context.env.DB.prepare(
    `SELECT COUNT(*) n FROM proposals WHERE accepted_at IS NOT NULL AND date(accepted_at) BETWEEN ?1 AND ?2`
  ).bind(from, to).first())?.n || 0;

  return json({
    from, to, total, booked, lost,
    conversion: total ? booked / total : 0,
    funnel, byStatus, sources,
    proposals_sent: propSent, proposals_accepted: propAccepted,
    quoted_total_cents: quoted, quoted_count: quotedCount,
  });
}
