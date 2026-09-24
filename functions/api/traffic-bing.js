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
//
// Two kinds of answer (2026-09-24). Search figures (clicks, impressions, the
// searches and pages) and the crawl counts are history, windowed on Bing's
// latest day. What Bing holds now — its sitemaps (bing_feeds), the addresses
// it could not read (bing_issues), which of the sitemap's pages it has found
// and when it last read each (bing_urls) — is the latest answer, not windowed,
// and comes back even while Bing has no search figures yet: a site Bing is
// still taking in is exactly when those matter.

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

  /* A table the ingest has not created yet reads as empty, not as an error:
     a site pushed before a table existed simply has no rows in it. */
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results || []).catch(() => []);
  const meta = Object.fromEntries((await q('SELECT key, value FROM bing_meta')).map((r) => [r.key, r.value]));
  if (!meta.site_url) return json({ ok: true, bing: null });

  /* Bing reports pages as absolute URLs; the rest of the dashboard speaks in
     paths. */
  const pathOf = (u) => {
    try { const x = new URL(u); return (x.pathname || '/') + x.search; } catch { return String(u || ''); }
  };
  const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };

  /* The window ends on Bing's latest day, not today. Bing runs a few days
     behind, so "the last 7 days" anchored on today would hold four days of
     numbers and read as a drop every single week. The crawl counts get their
     own latest day: Bing reports them on a different schedule. */
  const [lastRow, lastCrawlRow] = await Promise.all([
    q('SELECT MAX(day) AS d FROM bing_days'),
    q('SELECT MAX(day) AS d FROM bing_crawl'),
  ]);
  const last = lastRow[0]?.d || null;
  const lastCrawl = lastCrawlRow[0]?.d || null;
  const since = `-${days - 1} day`;           // inclusive of the anchor day
  const prevEnd = `-${days} day`;
  const prevStart = `-${days * 2 - 1} day`;

  /* Position is weighted by impressions, the way Bing and Google both report
     an average: a query seen 900 times at 4 and once at 60 averages near 4,
     not 32. Rows where Bing has no position stay out of the weighting. */
  const POS = `ROUND(SUM(CASE WHEN position IS NOT NULL THEN position * impressions END)
               / NULLIF(SUM(CASE WHEN position IS NOT NULL THEN impressions END), 0), 1)`;
  const none = Promise.resolve([]);

  const [daily, totals, previous, queries, pages, crawlLast, crawlWin, index, feeds, issues, redirects, urls, urlCounts] = await Promise.all([
    last ? q(`SELECT day, clicks, impressions FROM bing_days
        WHERE day >= date(?1, ?2) AND day <= ?1 ORDER BY day`, last, since) : none,
    last ? q(`SELECT COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions
         FROM bing_days WHERE day >= date(?1, ?2) AND day <= ?1`, last, since) : none,
    last ? q(`SELECT COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(impressions), 0) AS impressions
         FROM bing_days WHERE day >= date(?1, ?2) AND day <= date(?1, ?3)`, last, prevStart, prevEnd) : none,
    /* Clicks first: the searches that sent someone are the ones that matter;
       impressions break the tie and fill the list for a site with few clicks. */
    last ? q(`SELECT query, SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POS} AS position
         FROM bing_queries WHERE day >= date(?1, ?2)
        GROUP BY query ORDER BY clicks DESC, impressions DESC LIMIT 25`, last, since) : none,
    last ? q(`SELECT page, SUM(clicks) AS clicks, SUM(impressions) AS impressions, ${POS} AS position
         FROM bing_pages WHERE day >= date(?1, ?2)
        GROUP BY page ORDER BY clicks DESC, impressions DESC LIMIT 20`, last, since) : none,
    q(`SELECT day, in_index, in_links FROM bing_crawl ORDER BY day DESC LIMIT 1`),
    lastCrawl ? q(`SELECT COALESCE(SUM(crawled), 0) AS crawled, COALESCE(SUM(errors), 0) AS errors,
              COALESCE(SUM(code_4xx), 0) AS code_4xx, COALESCE(SUM(code_5xx), 0) AS code_5xx,
              COALESCE(SUM(blocked), 0) AS blocked, COALESCE(SUM(code_301 + code_302), 0) AS redirects
         FROM bing_crawl WHERE day >= date(?1, ?2) AND day <= ?1`, lastCrawl, since) : none,
    /* How many of the site's pages Bing holds, day by day over the window —
       the line that shows a new or moved site being taken in. */
    lastCrawl ? q(`SELECT day, in_index FROM bing_crawl
        WHERE day >= date(?1, ?2) AND day <= ?1 ORDER BY day`, lastCrawl, since) : none,
    q(`SELECT url, type, status, url_count, submitted, last_crawled, checked_at FROM bing_feeds ORDER BY url`),
    /* Bing lists redirects among its crawl issues. After a site move those are
       the old addresses doing their job, so they are counted, not listed; a
       row with anything beyond a 301 or 302 is a problem. */
    q(`SELECT url, http_code, issues, in_links, first_seen FROM bing_issues
        WHERE (issues & ~3) != 0 ORDER BY in_links DESC, url LIMIT 200`),
    q(`SELECT COUNT(*) AS n FROM bing_issues WHERE issues != 0 AND (issues & ~3) = 0`),
    /* The sitemap's pages: not found first, then found but not yet read, then
       the longest since Bing read them, and pages not asked about yet last. */
    q(`SELECT url, discovered, crawled, checked_at FROM bing_urls
        ORDER BY CASE WHEN checked_at IS NULL THEN 2 WHEN discovered IS NULL THEN 0 ELSE 1 END,
                 crawled IS NOT NULL, crawled, url LIMIT 1000`),
    q(`SELECT COUNT(*) AS listed, COUNT(checked_at) AS checked, COUNT(discovered) AS found,
              COALESCE(SUM(CASE WHEN crawled >= datetime('now', ?1) THEN 1 ELSE 0 END), 0) AS read_recent,
              MIN(checked_at) AS oldest_check, MAX(checked_at) AS newest_check
         FROM bing_urls`, `-${days} day`),
  ]);

  const counts = urlCounts[0] || {};
  const urlMeta = parse(meta.urls) || {};
  /* The run that last pushed says which reports it got an answer to (a
     count, or null when that call failed). A site pushed only by the older
     ingest, or whose call failed with nothing kept from before, has no word
     on its sitemaps or problems, and "none" would be a false answer; null
     says "not known yet". */
  const pushed = parse(meta.rows) || {};
  const asked = (k, rows) => (pushed[k] != null || rows.length ? rows : null);
  return json({
    ok: true,
    bing: {
      siteUrl: meta.site_url,
      updatedAt: meta.updated_at || null,
      asOf: last,
      days,
      /* No search figures yet. What Bing holds (below) can still be there. */
      empty: !last,
      totals: totals[0] || { clicks: 0, impressions: 0 },
      previous: previous[0] || { clicks: 0, impressions: 0 },
      daily,
      queries,
      pages: pages.map((p) => ({ ...p, path: pathOf(p.page) })),
      crawl: crawlLast[0] ? { asOf: crawlLast[0].day, inIndex: crawlLast[0].in_index, inLinks: crawlLast[0].in_links, ...(crawlWin[0] || {}) } : null,
      index: index.map((r) => ({ day: r.day, inIndex: r.in_index })),
      feeds: asked('feeds', feeds)?.map((f) => ({
        url: f.url, type: f.type, status: f.status, urlCount: f.url_count,
        submitted: f.submitted, lastCrawled: f.last_crawled, checkedAt: f.checked_at,
      })) ?? null,
      issues: asked('issues', issues)?.map((r) => ({
        url: r.url, path: pathOf(r.url), httpCode: r.http_code, issues: r.issues, inLinks: r.in_links, firstSeen: r.first_seen,
      })) ?? null,
      redirects: redirects[0]?.n || 0,
      coverage: counts.listed || urlMeta.problem ? {
        listed: counts.listed || 0,
        checked: counts.checked || 0,
        found: counts.found || 0,
        readRecent: counts.read_recent || 0,
        oldestCheck: counts.oldest_check || null,
        newestCheck: counts.newest_check || null,
        /* Set when the last run could not read the sitemap: the pages below
           are then from the run before. */
        problem: urlMeta.problem || null,
        pages: urls.map((r) => ({
          path: pathOf(r.url), discovered: r.discovered, crawled: r.crawled, checkedAt: r.checked_at,
        })),
      } : null,
    },
  });
}
