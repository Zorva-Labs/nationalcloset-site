// GET /api/traffic-channels?days=N — real visitor analytics from the
// server-side pageview log (functions/_middleware.js). Blocker-proof and
// GA-independent, and already excludes /crm, bots and non-US traffic.
//   channels : entries grouped by acquisition channel (is_entry = 1)
//   pages    : every pageview grouped by path (true per-page traffic)
//   visits   : total pageviews;  entries: session-starting hits
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const today = url.searchParams.get("today") === "1";
  let span = parseInt(url.searchParams.get("days") || "30", 10);
  if (!Number.isFinite(span) || span < 1) span = 30;
  span = Math.min(span, 90);
  const DB = context.env.DB;

  // Today = since CENTRAL midnight (created_at is UTC; date('now') would use the
  // UTC day, which flips at 7pm Central and makes "today" look empty). Central
  // midnight in UTC = now → Central wall-clock → start of day → back to UTC.
  const TF = today
    ? "created_at >= datetime('now', '-5 hours', 'start of day', '+5 hours')"
    : "created_at >= datetime('now', ?1)";
  const binds = today ? [] : [`-${span} days`];
  const q = (sql) => { const st = DB.prepare(sql); return (binds.length ? st.bind(...binds) : st).all().catch(() => ({ results: [] })); };

  const [channelsR, pagesR, totalsR, engPageR, engAllR] = await Promise.all([
    q(`SELECT channel, COUNT(*) AS n FROM pageviews
        WHERE ${TF} AND is_entry = 1
        GROUP BY channel ORDER BY n DESC`),
    q(`SELECT path, COUNT(*) AS n FROM pageviews
        WHERE ${TF}
        GROUP BY path ORDER BY n DESC LIMIT 15`),
    q(`SELECT COUNT(*) AS visits, SUM(is_entry) AS entries FROM pageviews
        WHERE ${TF}`),
    // Avg engagement seconds per page (from the first-party beacon).
    q(`SELECT path, ROUND(AVG(seconds)) AS avg_s, COUNT(*) AS samples FROM page_engagement
        WHERE ${TF} GROUP BY path`),
    q(`SELECT ROUND(AVG(seconds)) AS avg_s, COUNT(*) AS samples FROM page_engagement
        WHERE ${TF}`),
  ]);

  const channels = channelsR.results || [];
  const pages = pagesR.results || [];
  const t = (totalsR.results || [])[0] || {};
  const engByPath = {};
  for (const r of (engPageR.results || [])) engByPath[r.path] = r.avg_s || 0;
  const eng = (engAllR.results || [])[0] || {};

  return json({
    channels,
    pages,
    engByPath,
    avg_seconds: eng.avg_s || 0,
    eng_samples: eng.samples || 0,
    visits: t.visits || 0,
    entries: t.entries || 0,
    days: span,
  });
}
