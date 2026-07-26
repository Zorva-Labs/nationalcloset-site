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
  let span = parseInt(url.searchParams.get("days") || "30", 10);
  if (!Number.isFinite(span) || span < 1) span = 30;
  span = Math.min(span, 90);
  const since = `-${span} days`;
  const DB = context.env.DB;

  const q = (sql) => DB.prepare(sql).bind(since).all().catch(() => ({ results: [] }));

  const [channelsR, pagesR, totalsR] = await Promise.all([
    q(`SELECT channel, COUNT(*) AS n FROM pageviews
        WHERE created_at >= datetime('now', ?1) AND is_entry = 1
        GROUP BY channel ORDER BY n DESC`),
    q(`SELECT path, COUNT(*) AS n FROM pageviews
        WHERE created_at >= datetime('now', ?1)
        GROUP BY path ORDER BY n DESC LIMIT 15`),
    q(`SELECT COUNT(*) AS visits, SUM(is_entry) AS entries FROM pageviews
        WHERE created_at >= datetime('now', ?1)`),
  ]);

  const channels = channelsR.results || [];
  const pages = pagesR.results || [];
  const t = (totalsR.results || [])[0] || {};
  return json({
    channels,
    pages,
    visits: t.visits || 0,
    entries: t.entries || 0,
    days: span,
  });
}
