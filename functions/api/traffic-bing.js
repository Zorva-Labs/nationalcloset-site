// GET /api/traffic-bing?days=N — the traffic-kit endpoint (~/traffic-kit/template/functions/api/traffic/bing.js),
// behind this CRM's own requireAuth, since /api here has no directory middleware.
//
//
// Bing Webmaster Tools for this site: clicks and impressions from Bing search,
// the searches and pages Bing showed, and what Bing's crawler holds. Bing is
// also the index Copilot answers from and ChatGPT search draws on, which is
// why it gets a section of its own.
//
// Pushed into THIS site's D1 once a day by the central ingest (gsc-ingest,
// src/bing.js), the same containment as the rankings and GA4 panels: the
// database this deployment is bound to holds only this site's rows, so there
// is no site to select and nothing to tamper with. Behind the same
// _middleware.js as the rest of /api/traffic.
//
// Its own endpoint rather than a key in data.js on purpose: every site's
// data.js has drifted from the template, and a new file drops in whole
// (bin/add-bing.mjs).
//
// { bing: null } means the tables are absent — the site is not in Bing
// Webmaster Tools yet — and the page says so in words, not as zeroes. Tables
// with no rows mean Bing has not reported anything yet, which the page also
// says: the two look identical as numbers and only one is a problem.

import { requireAuth } from "../_lib/auth.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { request } = context;
  const db = context.env.DB;
  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get('days') || '30', 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  days = Math.min(days, 365);

  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results || []).catch(() => []);
  const meta = Object.fromEntries((await q('SELECT key, value FROM bing_meta')).map((r) => [r.key, r.value]));
  if (!meta.site_url) return json({ ok: true, bing: null });

  /* The window ends on Bing's latest day, not today. Bing runs a few days
     behind, so "the last 7 days" anchored on today would hold four days of
     numbers and read as a drop every single week. */
  const last = (await q('SELECT MAX(day) AS d FROM bing_days'))[0]?.d || null;
  const base = {
    siteUrl: meta.site_url,
    updatedAt: meta.updated_at || null,
    asOf: last,
    days,
  };
  if (!last) return json({ ok: true, bing: { ...base, empty: true } });

  const since = `-${days - 1} day`;           // inclusive of the anchor day
  const prevEnd = `-${days} day`;
  const prevStart = `-${days * 2 - 1} day`;

  /* Position is weighted by impressions, the way Bing and Google both report
     an average: a query seen 900 times at 4 and once at 60 averages near 4,
     not 32. Rows where Bing has no position stay out of the weighting. */
  const POS = `ROUND(SUM(CASE WHEN position IS NOT NULL THEN position * impressions END)
               / NULLIF(SUM(CASE WHEN position IS NOT NULL THEN impressions END), 0), 1)`;

  const [daily, totals, previous, queries, pages, crawlLast, crawlWin] = await Promise.all([
    q(`SELECT day, clicks, impressions FROM bing_days
        WHERE day >= date(?1, ?2) AND day <= ?1 ORDER BY day`, last, since),
    q(`SELECT COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions
         FROM bing_days WHERE day >= date(?1, ?2) AND day <= ?1`, last, since),
    q(`SELECT COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions
         FROM bing_days WHERE day >= date(?1, ?2) AND day <= date(?1, ?3)`, last, prevStart, prevEnd),
    /* Clicks first: the searches that sent someone are the ones that matter;
       impressions break the tie and fill the list for a site with few clicks. */
    q(`SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POS} AS position
         FROM bing_queries WHERE day >= date(?1, ?2)
        GROUP BY query ORDER BY clicks DESC, impressions DESC LIMIT 25`, last, since),
    q(`SELECT page, SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POS} AS position
         FROM bing_pages WHERE day >= date(?1, ?2)
        GROUP BY page ORDER BY clicks DESC, impressions DESC LIMIT 20`, last, since),
    q(`SELECT day, in_index, in_links FROM bing_crawl ORDER BY day DESC LIMIT 1`),
    q(`SELECT COALESCE(SUM(crawled), 0) AS crawled, COALESCE(SUM(errors), 0) AS errors,
              COALESCE(SUM(code_4xx), 0) AS code_4xx, COALESCE(SUM(code_5xx), 0) AS code_5xx,
              COALESCE(SUM(blocked), 0) AS blocked, COALESCE(SUM(code_301 + code_302), 0) AS redirects
         FROM bing_crawl WHERE day >= date(?1, ?2)`, last, since),
  ]);

  /* Bing reports pages as absolute URLs; the rest of the dashboard speaks in
     paths. */
  const pathOf = (u) => {
    try { return new URL(u).pathname || '/'; } catch { return String(u || ''); }
  };

  return json({
    ok: true,
    bing: {
      ...base,
      empty: false,
      totals: totals[0] || { clicks: 0, impressions: 0 },
      previous: previous[0] || { clicks: 0, impressions: 0 },
      daily,
      queries,
      pages: pages.map((p) => ({ ...p, path: pathOf(p.page) })),
      crawl: crawlLast[0] ? { asOf: crawlLast[0].day, inIndex: crawlLast[0].in_index, inLinks: crawlLast[0].in_links, ...(crawlWin[0] || {}) } : null,
    },
  });
}
