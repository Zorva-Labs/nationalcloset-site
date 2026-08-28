// GET /api/traffic-rankings — Google Search Console positions for this site.
//
// Written weekly into this site's own D1 by the gsc-ingest Worker. Deliberately
// NOT read from the central rankings store: that database holds every client's
// keywords, and this CRM's session carries no site identity to filter it by, so
// the only safe boundary is the one that already exists — the database this
// deployment is bound to contains this site and nothing else.
//
// Everything else on the traffic page is live to the second. This is not:
// Search Console lags about three days and the ingest runs weekly. The UI says
// so rather than presenting both at the same apparent freshness.
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  if (!DB) return json({ installed: false, error: "no_db" });

  // A missing table and an empty one are different facts. The first is a job
  // for us, the second is a job for time, and a dashboard that renders both as
  // blank is indistinguishable from a broken pipeline.
  const latest = await DB.prepare("SELECT MAX(week_start) AS w FROM rank_snapshots")
    .first().catch(() => null);
  if (!latest) return json({ installed: false });
  const week = latest.w;

  const meta = Object.fromEntries(
    ((await DB.prepare("SELECT key, value FROM rank_meta").all().catch(() => ({ results: [] }))).results || [])
      .map((r) => [r.key, r.value])
  );
  /* Keywords we have said matter for this site, each with where it sits today.
     LEFT JOIN on purpose: Search Console reports nothing at all for a term the
     site does not rank for — not a position — so a null here means "not ranking
     yet", which is the honest answer and the one worth showing. Queried before
     the early return so a brand-new site with a target list still shows it,
     which is exactly when that list is most useful. */
  const watch = ((await DB.prepare(
    `SELECT w.label, w.query, w.note, s.position, s.impressions, s.clicks,
            b.position AS was
       FROM rank_watch w
       LEFT JOIN rank_snapshots s ON s.query = w.query AND s.week_start = ?1
       LEFT JOIN rank_baseline  b ON b.query = w.query
      ORDER BY (s.position IS NULL), s.position`
  ).bind(week || '').all().catch(() => ({ results: [] }))).results || []);

  if (!week) return json({ installed: true, week: null, meta, watch, trend: [] });

  const q = (sql, ...binds) => {
    const st = DB.prepare(sql);
    return (binds.length ? st.bind(...binds) : st).all().catch(() => ({ results: [] }));
  };

  const [trend, movement, top, striking, fresh, pages, convPages] = await Promise.all([
    // Buckets, not average position. Average position gets WORSE as a site
    // succeeds, because newly earned long-tail terms enter around 40 and drag
    // the mean down — a client watching that number panics in month three,
    // exactly when the work starts landing.
    q(`SELECT week_start,
              SUM(CASE WHEN position <= 3 THEN 1 ELSE 0 END)  AS top3,
              SUM(CASE WHEN position >  3 AND position <= 10 THEN 1 ELSE 0 END) AS top10,
              SUM(CASE WHEN position > 10 AND position <= 20 THEN 1 ELSE 0 END) AS top20,
              SUM(CASE WHEN position > 20 THEN 1 ELSE 0 END)  AS rest,
              COUNT(*) AS total, SUM(impressions) AS impressions, SUM(clicks) AS clicks
         FROM rank_snapshots GROUP BY week_start ORDER BY week_start DESC LIMIT 26`),

    // Wins and losses in one list. Showing only the winners is the fastest way
    // to make a real result look fabricated.
    q(`SELECT s.query, s.position AS now, b.position AS was, b.week_start AS since,
              s.impressions, s.clicks
         FROM rank_snapshots s JOIN rank_baseline b ON b.query = s.query
        WHERE s.week_start = ?1 AND b.week_start < ?1
        ORDER BY (b.position - s.position) DESC LIMIT 30`, week),

    q(`SELECT query, position, impressions, clicks FROM rank_snapshots
        WHERE week_start = ?1 ORDER BY impressions DESC LIMIT 25`, week),

    // Positions 4-20 with real volume: close enough to page one to be worth
    // next month's work, which is what turns the report from a receipt into a
    // reason to keep going.
    q(`SELECT query, position, impressions FROM rank_snapshots
        WHERE week_start = ?1 AND position > 3 AND position <= 20 AND impressions >= 3
        ORDER BY impressions DESC LIMIT 15`, week),

    q(`SELECT query, position, impressions FROM rank_baseline
        WHERE week_start = ?1 ORDER BY impressions DESC LIMIT 15`, week),

    q(`SELECT page, COUNT(*) AS queries, SUM(impressions) AS impressions,
              SUM(clicks) AS clicks, MIN(position) AS best
         FROM rank_pages WHERE week_start = ?1
        GROUP BY page ORDER BY clicks DESC, impressions DESC LIMIT 20`, week),

    // The join nobody else can show. Rankings are keyed by page, leads by the
    // path they came from, and this CRM is the only place both exist.
    q(`SELECT path, COUNT(*) AS leads FROM pageviews
        WHERE path IS NOT NULL AND created_at >= datetime('now','-90 days')
        GROUP BY path`),
  ]);

  // rank_pages holds absolute URLs from Google; pageviews holds paths.
  // Normalising here keeps trailing-slash handling in one readable place —
  // Google reports /closets/ where the site logs /closets, and an unmatched
  // pair silently drops the most valuable row on the page.
  const pathOf = (url) => {
    try { return new URL(url).pathname.replace(/\/+$/, "") || "/"; }
    catch { return String(url || "").replace(/\/+$/, "") || "/"; }
  };
  const visitsBy = Object.fromEntries((convPages.results || []).map((r) => [pathOf(r.path), r.leads]));
  const pageRows = (pages.results || []).map((r) => ({ ...r, path: pathOf(r.page), visits: visitsBy[pathOf(r.page)] || 0 }));

  return json({
    installed: true,
    week,
    meta,
    watch,
    trend: (trend.results || []).slice().reverse(),
    movement: movement.results || [],
    top: top.results || [],
    striking: striking.results || [],
    fresh: fresh.results || [],
    pages: pageRows,
  });
}
