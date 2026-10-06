// GET /api/traffic/data?days=N[&tn=1]
//
// Everything traffic-kit's tabbed dashboard (crm/traffic.html) renders, in one
// round trip and in the kit's own shape, read from this site's tables. The kit's
// data.js reads a `pageviews` log with crawlers in it and an `events` table of
// calls and forms; this site has neither, so this file is National Closet's
// port of it (traffic-kit's template/functions/api/traffic/data.js):
//
//   - Visits are the engagement beacon's `page_engagement`, not the edge's
//     `pageviews`. Only a real browser running js/main.js sends the beacon, so
//     it is the honest count here (docs/traffic.md); the edge log still holds
//     the bots that get through the gate and runs about three times higher. The
//     beacon has carried the channel and the state since 2026-09-13, so rows
//     from before then (no channel) are left out rather than counted as Direct.
//   - The forms are the website's own rows in `leads` (source_page 'website…',
//     never 'crm-manual'), each a form saved before it was emailed. Its channel
//     comes from the same classifier the beacon uses (_lib/channel.js). Taps to
//     call are not logged on this site, so there are no calls.
//   - No crawlers: the middleware drops bots unlogged. No devices: neither log
//     keeps a user agent. The states (`region`) take the devices' place.
//   - tn=1 keeps visits from Tennessee only (Cloudflare's region), the view the
//     business is judged on. Leads are not filtered: they are all local.
//
// The Search Console and Analytics halves, rankings() and analytics(), are the
// kit's, word for word.

import { centralOffset, leadEvent } from "../../_lib/traffic-leads.js";

const ZONE = "1d51a379abcf889e1f8a5445f6ed9b93"; // nationalclosetco.com, as in ../traffic.js

/* CF_ANALYTICS_TOKEN (an API token, Bearer) since 2026-09-24; the global key
   pair stays as the fallback, as in ../traffic.js. */
function cfAnalyticsAuth(env) {
  return env.CF_ANALYTICS_TOKEN
    ? { Authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}` }
    : { "X-Auth-Email": env.CF_ANALYTICS_EMAIL, "X-Auth-Key": env.CF_ANALYTICS_KEY };
}
const cfAnalyticsConfigured = (env) => !!(env.CF_ANALYTICS_TOKEN || (env.CF_ANALYTICS_EMAIL && env.CF_ANALYTICS_KEY));

async function cfGraphQL(env, query) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { ...cfAnalyticsAuth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return r.json().catch(() => ({}));
}

/* ------------------------------- analytics -------------------------------- */
/* Google Analytics, pushed into THIS site's D1 by the central ingest. The same
   shape and the same containment as rankings() below.

   Returns null when the table is absent, which is the honest answer for a site
   whose ingest has not run. The panel says so rather than showing three zeroes
   — no pipeline and no traffic look identical otherwise, and only one of them
   is a problem. */
async function analytics(db) {
  const meta = await db
    .prepare("SELECT value FROM ga4_meta WHERE key = 'measurement_id'")
    .first()
    .catch(() => null);
  if (!meta) return null;

  const asOf = await db.prepare('SELECT MAX(day) AS d FROM ga4_days').first().catch(() => null);
  const days = (await db.prepare(
    'SELECT day, sessions, users, views FROM ga4_days ORDER BY day').all().catch(() => ({}))).results || [];
  const channels = (await db.prepare(
    'SELECT channel, SUM(sessions) AS sessions FROM ga4_channels GROUP BY channel ORDER BY sessions DESC'
  ).all().catch(() => ({}))).results || [];

  /* The six Analytics cards (page, channel, event, new users, country,
     device) read these, grouped by kind. ga4_dims is written with ga4_days by
     ~/nashvilles-network/scripts/ga4-ingest.mjs. Until 2026-09-24 the template
     left them out, and every dashboard built from it showed those cards empty. */
  const dims = (await db.prepare(
    'SELECT kind, label, value, prev FROM ga4_dims ORDER BY kind, value DESC'
  ).all().catch(() => ({}))).results || [];
  const byKind = {};
  for (const d of dims) (byKind[d.kind] = byKind[d.kind] || []).push(d);
  return { measurementId: meta.value, asOf: asOf && asOf.d, days, channels, dims: byKind };
}

async function rankings(db) {
  const latest = await db
    .prepare('SELECT MAX(week_start) AS w FROM rank_snapshots')
    .first()
    .catch(() => null);
  if (!latest) return null;                       // tables not installed
  const week = latest.w;

  const meta = Object.fromEntries(
    ((await db.prepare('SELECT key, value FROM rank_meta').all()).results || [])
      .map((r) => [r.key, r.value])
  );
  /* Target keywords: the searches we have set out to win for this site.
     LEFT JOIN on purpose — Search Console reports nothing at all for a term the
     site does not rank for, not a position, so a null here means "not ranking
     yet", which is the honest answer and the one worth showing. Queried before
     the early return so a brand-new site with a target list still shows it,
     which is exactly when that list is most useful. */
  const watch = ((await db.prepare(
    `SELECT w.label, w.query, w.note, s.position, s.impressions, s.clicks,
            b.position AS was
       FROM rank_watch w
       LEFT JOIN rank_snapshots s ON s.query = w.query AND s.week_start = ?1
       LEFT JOIN rank_baseline  b ON b.query = w.query
      ORDER BY (s.position IS NULL), s.position`
  ).bind(week || '').all().catch(() => ({ results: [] }))).results || []);

  if (!week) return { installed: true, week: null, meta, watch, trend: [] };

  const [trend, movement, top, striking, fresh, pages] = await Promise.all([
    /* The headline chart. Deliberately buckets, not average position: average
       position gets WORSE as a site succeeds, because newly earned long-tail
       keywords enter around 40 and drag the mean down. A client watching that
       number panics in month three, exactly when the work starts landing. */
    db.prepare(
      `SELECT week_start,
              SUM(CASE WHEN position <= 3 THEN 1 ELSE 0 END)  AS top3,
              SUM(CASE WHEN position >  3 AND position <= 10 THEN 1 ELSE 0 END) AS top10,
              SUM(CASE WHEN position > 10 AND position <= 20 THEN 1 ELSE 0 END) AS top20,
              SUM(CASE WHEN position > 20 THEN 1 ELSE 0 END)  AS rest,
              COUNT(*) AS total, SUM(impressions) AS impressions, SUM(clicks) AS clicks
         FROM rank_snapshots GROUP BY week_start ORDER BY week_start DESC LIMIT 53`
    ).all(),

    /* Wins and losses in one list, sorted by movement. Showing only the
       winners is the fastest way to make a real result look fabricated. */
    db.prepare(
      `SELECT s.query, s.position AS now, b.position AS was, b.week_start AS since,
              s.impressions, s.clicks
         FROM rank_snapshots s JOIN rank_baseline b ON b.query = s.query
        WHERE s.week_start = ?1 AND b.week_start < ?1
        ORDER BY (b.position - s.position) DESC LIMIT 30`
    ).bind(week).all(),

    db.prepare(
      `SELECT query, position, impressions, clicks FROM rank_snapshots
        WHERE week_start = ?1 ORDER BY impressions DESC LIMIT 25`
    ).bind(week).all(),

    /* Positions 4-20 with real volume: close enough to page one to be worth
       the next month's work, which is what turns the report from a receipt
       into a reason to keep going. */
    db.prepare(
      `SELECT query, position, impressions FROM rank_snapshots
        WHERE week_start = ?1 AND position > 3 AND position <= 20 AND impressions >= 3
        ORDER BY impressions DESC LIMIT 15`
    ).bind(week).all(),

    /* First seen this week — terms nobody predicted. */
    db.prepare(
      `SELECT query, position, impressions FROM rank_baseline
        WHERE week_start = ?1 ORDER BY impressions DESC LIMIT 15`
    ).bind(week).all(),

    db.prepare(
      `SELECT page, COUNT(*) AS queries, SUM(impressions) AS impressions,
              SUM(clicks) AS clicks, MIN(position) AS best
         FROM rank_pages WHERE week_start = ?1
        GROUP BY page ORDER BY clicks DESC, impressions DESC LIMIT 20`
    ).bind(week).all(),
  ]);

  /* rank_pages holds absolute URLs from Google; the events table holds paths.
     Normalizing here rather than in SQL keeps the trailing-slash handling in
     one readable place — Google reports /roofing/ where the site logs
     /roofing, and an unmatched pair silently drops the most valuable row on
     the page. */
  const pathOf = (url) => {
    try { return new URL(url).pathname.replace(/\/+$/, '') || '/'; }
    catch { return String(url || '').replace(/\/+$/, '') || '/'; }
  };
  const topQueryByPage = new Map();
  for (const r of (await db.prepare(
    `SELECT page, query, position, impressions FROM rank_pages
      WHERE week_start = ?1 ORDER BY impressions DESC`
  ).bind(week).all()).results || []) {
    const k = pathOf(r.page);
    if (!topQueryByPage.has(k)) topQueryByPage.set(k, { query: r.query, position: r.position });
  }

  /* The money list. `top` is ordered by impressions, which is the right way to
     show reach but buries the handful of terms that did the work — a query
     shown 900 times with no clicks outranks one shown 40 times that brought 11
     people. So this gets its own panel and its own ordering. */
  const clicked = await db.prepare(
    `SELECT query, position, impressions, clicks
       FROM rank_snapshots
      WHERE week_start = ?1 AND clicks > 0
      ORDER BY clicks DESC, impressions DESC LIMIT 25`
  ).bind(week).all().catch(() => ({ results: [] }));

  return {
    installed: true,
    week,
    meta,
    watch,
    clicked: clicked.results || [],
    trend: (trend.results || []).reverse(),
    movement: movement.results || [],
    top: top.results || [],
    striking: striking.results || [],
    fresh: fresh.results || [],
    pages: (pages.results || []).map((p) => ({ ...p, path: pathOf(p.page) })),
    /* Keyed by path so the client can line these up against conversion pages
       without a second round trip. */
    queryByPath: Object.fromEntries(topQueryByPage),
  };
}

export async function onRequestGet({ request, env, data }) {
  const OFF = centralOffset();
  const db = data.db;
  const url = new URL(request.url);

  let days = parseInt(url.searchParams.get("days") || "30", 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  days = Math.min(days, 365);
  const tn = url.searchParams.get("tn") === "1";
  const since = `-${days} day`;
  const prevStart = `-${days * 2} day`;

  const q = (sql, ...binds) =>
    db.prepare(sql).bind(...binds).all().then((r) => r.results || []).catch(() => []);

  const localDay = `date(created_at, '-${OFF} hours')`;
  const localHour = `CAST(strftime('%H', created_at, '-${OFF} hours') AS INTEGER)`;
  const localDow = `CAST(strftime('%w', created_at, '-${OFF} hours') AS INTEGER)`;

  /* A person: a beacon with the channel it has carried since 2026-09-13 (and,
     with tn=1, from Tennessee). An entry is the first page of a visit. */
  const HUMAN = `channel IS NOT NULL${tn ? " AND region = 'TN'" : ""}`;
  const ENTRY = "is_entry = 1";
  const WIN = "created_at >= datetime('now', ?1)";

  const [
    daily, topPages, channels, entryPages, countries, regions,
    engagement, totals, hours, referrers, prevTotals, week, channelDaily, firstRow, allEntries,
  ] = await Promise.all([
    q(`SELECT ${localDay} AS day, COUNT(*) AS views, SUM(CASE WHEN ${ENTRY} THEN 1 ELSE 0 END) AS entries
         FROM page_engagement WHERE ${WIN} AND ${HUMAN} GROUP BY day ORDER BY day ASC`, since),
    q(`SELECT path, COUNT(*) AS views FROM page_engagement WHERE ${WIN} AND ${HUMAN}
        GROUP BY path ORDER BY views DESC LIMIT 15`, since),
    q(`SELECT channel, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY}
        GROUP BY channel ORDER BY n DESC LIMIT 15`, since),
    q(`SELECT path, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY}
        GROUP BY path ORDER BY n DESC LIMIT 12`, since),
    q(`SELECT country, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY} AND country IS NOT NULL
        GROUP BY country ORDER BY n DESC LIMIT 12`, since),
    /* The states the visits came from, Tennessee first among equals: the only
       state the business works in. */
    q(`SELECT region, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY} AND country = 'US' AND region IS NOT NULL
        GROUP BY region ORDER BY n DESC LIMIT 20`, since),
    q(`SELECT path, COUNT(*) AS samples, ROUND(AVG(seconds)) AS avg_seconds, MAX(seconds) AS max_seconds
         FROM page_engagement WHERE ${WIN} AND ${HUMAN}
        GROUP BY path HAVING samples >= 2 ORDER BY avg_seconds DESC LIMIT 12`, since),
    q(`SELECT COUNT(*) AS views,
              COALESCE(SUM(CASE WHEN ${ENTRY} THEN 1 ELSE 0 END), 0) AS entries,
              COALESCE(SUM(CASE WHEN ${ENTRY} AND channel = 'Google Ads' THEN 1 ELSE 0 END), 0) AS ad_clicks,
              COALESCE(SUM(CASE WHEN ${ENTRY} AND region = 'TN' THEN 1 ELSE 0 END), 0) AS tn_entries
         FROM page_engagement WHERE ${WIN} AND ${HUMAN}`, since),
    q(`SELECT ${localHour} AS hour, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN}
        GROUP BY hour ORDER BY hour ASC`, since),
    /* Another site that sent a visit: the beacon files an unnamed referrer
       under its host name. */
    q(`SELECT channel AS host, COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY}
          AND channel LIKE '%.%' GROUP BY channel ORDER BY n DESC LIMIT 12`, since),
    q(`SELECT COUNT(*) AS views, COALESCE(SUM(CASE WHEN ${ENTRY} THEN 1 ELSE 0 END), 0) AS entries
         FROM page_engagement
        WHERE created_at >= datetime('now', ?1) AND created_at < datetime('now', ?2) AND ${HUMAN}`, prevStart, since),
    q(`SELECT ${localDow} AS dow, ${localHour} AS hour, COUNT(*) AS n
         FROM page_engagement WHERE ${WIN} AND ${HUMAN} GROUP BY dow, hour`, since),
    q(`SELECT ${localDay} AS day, channel, COUNT(*) AS n
         FROM page_engagement WHERE ${WIN} AND ${HUMAN} AND ${ENTRY} GROUP BY day, channel ORDER BY day`, since),
    q(`SELECT MIN(created_at) AS first FROM page_engagement WHERE channel IS NOT NULL`),
    /* Every visit whatever the state: Analytics counts them all, so the
       Analytics tab compares with this one even when tn=1. */
    q(`SELECT COUNT(*) AS n FROM page_engagement WHERE ${WIN} AND channel IS NOT NULL AND ${ENTRY}`, since),
  ]);

  /* ---- Conversions: the website's forms -------------------------------------- */
  const WEBSITE = "source_page LIKE 'website%'";
  const [leadRows, prevLeads, everLeads] = await Promise.all([
    q(`SELECT id, created_at, name, interest, source_page, landing_page, referrer, utm_source, utm_medium, gclid
         FROM leads WHERE ${WEBSITE} AND created_at >= datetime('now', ?1) ORDER BY created_at DESC LIMIT 200`, since),
    q(`SELECT COUNT(*) AS n FROM leads WHERE ${WEBSITE}
          AND created_at >= datetime('now', ?1) AND created_at < datetime('now', ?2)`, prevStart, since),
    q(`SELECT COUNT(*) AS n FROM leads WHERE ${WEBSITE}`),
  ]);
  const recent = leadRows.map((l) => leadEvent(l, OFF));
  const count = (key) => {
    const m = new Map();
    for (const r of recent) { const k = key(r); if (k != null) m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const toRows = (m, field) => [...m].map(([k, n]) => ({ [field]: k, n }));
  const localOf = (r) => r.local_time;
  const dayOf = (r) => localOf(r).slice(0, 10);
  const hourOf = (r) => +localOf(r).slice(11, 13);
  const dowOf = (r) => new Date(`${dayOf(r)}T12:00:00Z`).getUTCDay();
  const weekMap = count((r) => `${dowOf(r)}|${hourOf(r)}`);
  const conversions = {
    total: recent.length,
    byName: recent.length ? { form_complete: recent.length } : {},
    daily: toRows(count(dayOf), "day").sort((a, b) => (a.day < b.day ? -1 : 1)),
    pages: toRows(count((r) => r.landing || r.path), "path").sort((a, b) => b.n - a.n).slice(0, 12),
    leadNames: { table: true, matched: recent.filter((r) => r.lead_name).length },
    recent,
    channels: toRows(count((r) => r.channel || "Unknown"), "channel").sort((a, b) => b.n - a.n),
    hours: toRows(count(hourOf), "hour").sort((a, b) => a.hour - b.hour),
    week: [...weekMap].map(([k, n]) => { const [dow, hour] = k.split("|").map(Number); return { dow, hour, n }; }),
    previous: prevLeads[0]?.n || 0,
    /* Every form is saved to the CRM before it is emailed (functions/api/contact.js),
       so a lead here is one that arrived; there is no thank-you step to compare. */
    hasThankYou: false,
    saved: true,
    calls: false,
    ever: everLeads[0]?.n || 0,
  };

  /* ---- Cloudflare edge ---------------------------------------------------- */
  let edge = { configured: false, days: [], totals: null };
  if (cfAnalyticsConfigured(env)) {
    const DAY = 86400000;
    const now = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const span = Math.min(days, 30);
    const start = iso(new Date(now.getTime() - span * DAY));
    const query = `query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
      httpRequests1dGroups(limit: 31, filter: {date_geq: "${start}", date_leq: "${iso(now)}"}, orderBy: [date_ASC]) {
        dimensions { date }
        sum { pageViews requests }
        uniq { uniques }
      }
    } } }`;
    try {
      const res = await cfGraphQL(env, query);
      const groups = res?.data?.viewer?.zones?.[0]?.httpRequests1dGroups;
      if (Array.isArray(groups)) {
        edge = {
          configured: true,
          days: groups.map((g) => ({ day: g.dimensions.date, pageViews: g.sum.pageViews, requests: g.sum.requests, uniques: g.uniq.uniques })),
        };
        edge.totals = edge.days.reduce(
          (a, d) => ({ pageViews: a.pageViews + d.pageViews, requests: a.requests + d.requests, uniques: a.uniques + d.uniques }),
          { pageViews: 0, requests: 0, uniques: 0 }
        );
      } else {
        edge.error = res?.errors?.[0]?.message || "no data returned";
      }
    } catch (err) {
      edge.error = String(err?.message || err).slice(0, 200);
    }
  }

  let rank = null;
  try { rank = await rankings(db); } catch { rank = null; }
  let ga = null;
  try { ga = await analytics(db); } catch { ga = null; }

  return new Response(
    JSON.stringify({
      ok: true,
      days,
      tn,
      generatedAt: new Date().toISOString(),
      timezone: `UTC-${OFF} (Central)`,
      geoGate: String(env.GEO_ALLOW || "US"),
      firstParty: {
        source: "page_engagement",
        since: firstRow[0]?.first || null,
        totals: { ...(totals[0] || { views: 0, entries: 0, ad_clicks: 0, tn_entries: 0 }), all_entries: allEntries[0]?.n || 0 },
        previous: prevTotals[0] || { views: 0, entries: 0 },
        daily, topPages, channels, entryPages, countries, regions,
        engagement, hours, devices: [], referrers, week, channelDaily,
      },
      crawlers: { total: 0, list: [], logged: false },
      conversions,
      edge,
      rankings: rank,
      ga4: ga,
    }),
    { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }
  );
}
