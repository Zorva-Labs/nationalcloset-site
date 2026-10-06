// GET /api/traffic/ads?days=N
//
// The Google Ads tab. Two sources, side by side on purpose:
//
//   ads   — the account, as Google reports it: spend, impressions, clicks, the
//           searches that triggered the ads, keywords, campaigns, devices, hours
//           and Google's own conversion count. Pushed into THIS site's D1 nightly
//           by ~/fleet/skills/ads-report (`ads-report.mjs sync`), only for the
//           sites whose ads we run. null when there are no ads_* rows: the page
//           then shows what we would do for the business instead.
//   edge  — our own log of the people who arrived from an ad click (a gclid,
//           wbraid or gbraid on the landing URL) and what they did: the visits,
//           the calls and completed forms, the pages they landed on. It is here
//           whether or not we run the account, which is how the page can tell a
//           business already paying for ads somewhere else.
//
// The window ends on Google's latest complete day (the sync pulls through
// yesterday) and our log is cut to the same local days, so "cost per lead"
// divides one period's spend by the same period's leads. With no ads rows it
// ends today, like the rest of the dashboard.
//
// Behind the same _middleware.js as every /api/traffic route (the CRM's
// sign-in). The database is the one this deployment is bound to.
//
// National Closet's port of traffic-kit's template/functions/api/traffic/ads.js:
// the Google half (the ads_* tables) is the kit's, word for word. The edge half
// reads this site's tables, as data.js does: visits from the engagement beacon
// (`page_engagement`, channel 'Google Ads': a gclid, wbraid or gbraid, or a
// google utm), leads from the website's rows in `leads` that came from an ad.
// The middleware drops Google's ad reviewers unlogged, so there is no count of
// them, and no devices.

/* Central time from the IANA zone (_lib/dates.js), never a flat offset; the
   lead rows in the kit's `events` shape come from _lib/traffic-leads.js. */
import { centralOffset, leadEvent } from "../../_lib/traffic-leads.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
    },
  });

const addDays = (isoDay, n) => {
  const d = new Date(`${isoDay}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};


export async function onRequestGet({ request, data }) {
  const db = data.db;
  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get('days') || '30', 10);
  if (!Number.isFinite(days) || days < 1) days = 30;
  days = Math.min(days, 365);

  const OFF = centralOffset();
  const tn = url.searchParams.get('tn') === '1';
  const q = (sql, ...b) => db.prepare(sql).bind(...b).all().then((r) => r.results || []).catch(() => []);
  const one = async (sql, ...b) => (await q(sql, ...b))[0] || {};

  const meta = Object.fromEntries((await q('SELECT key, value FROM ads_meta')).map((r) => [r.key, r.value]));
  const asOf = meta.customer_id ? (await one('SELECT MAX(day) AS d FROM ads_days')).d || null : null;
  const today = new Date(Date.now() - OFF * 3600e3).toISOString().slice(0, 10);
  const end = asOf || today;
  const start = addDays(end, -(days - 1));
  const pEnd = addDays(start, -1);
  const pStart = addDays(start, -days);

  /* ------------------------------------------------ our own log ------------------------------------------------ */
  const localDay = `date(created_at, '-${OFF} hours')`;
  const inWin = (a, b) => `created_at >= datetime('${a}', '-1 day') AND ${localDay} BETWEEN '${a}' AND '${b}'`;
  const AD = `channel = 'Google Ads' AND is_entry = 1${tn ? " AND region = 'TN'" : ''}`;
  const [visits, pVisits, eDaily, landing, leadRows, pLeadRows] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM page_engagement WHERE ${AD} AND ${inWin(start, end)}`),
    one(`SELECT COUNT(*) AS n FROM page_engagement WHERE ${AD} AND ${inWin(pStart, pEnd)}`),
    q(`SELECT ${localDay} AS day, COUNT(*) AS n FROM page_engagement WHERE ${AD} AND ${inWin(start, end)} GROUP BY day ORDER BY day`),
    q(`SELECT path, COUNT(*) AS n FROM page_engagement WHERE ${AD} AND ${inWin(start, end)} GROUP BY path ORDER BY n DESC LIMIT 12`),
    q(`SELECT id, created_at, name, interest, source_page, landing_page, referrer, utm_source, utm_medium, gclid
         FROM leads WHERE source_page LIKE 'website%' AND ${inWin(start, end)} ORDER BY created_at DESC`),
    q(`SELECT id, created_at, source_page, landing_page, referrer, utm_source, utm_medium, gclid
         FROM leads WHERE source_page LIKE 'website%' AND ${inWin(pStart, pEnd)}`),
  ]);
  const fromAd = (rows) => rows.map((l) => leadEvent(l, OFF)).filter((r) => r.channel === 'Google Ads');
  const recent = fromAd(leadRows).slice(0, 50);
  const lDaily = new Map();
  const leadsAt = {};
  for (const r of fromAd(leadRows)) {
    lDaily.set(r.local_time.slice(0, 10), (lDaily.get(r.local_time.slice(0, 10)) || 0) + 1);
    const p = String(r.landing || r.path || '').split('?')[0];
    leadsAt[p] = (leadsAt[p] || 0) + 1;
  }
  const nLeads = fromAd(leadRows).length;
  const edge = {
    start, end,
    visits: visits.n || 0,
    previousVisits: pVisits.n || 0,
    leads: { total: nLeads, call: 0, form: nLeads },
    previousLeads: fromAd(pLeadRows).length,
    daily: eDaily.map((r) => ({ day: r.day, visits: r.n, leads: lDaily.get(r.day) || 0 }))
      .concat([...lDaily].filter(([d]) => !eDaily.some((r) => r.day === d)).map(([day, n]) => ({ day, visits: 0, leads: n })))
      .sort((a, b) => (a.day < b.day ? -1 : 1)),
    landing: landing.map((r) => ({ path: r.path, visits: r.n, leads: leadsAt[String(r.path || '').split('?')[0]] || 0 })),
    devices: [],
    recent,
    reviewVisits: 0,
    calls: false,
  };

  if (!meta.customer_id) return json({ ok: true, days, ads: null, edge });

  /* ------------------------------------------------- Google ------------------------------------------------- */
  const W = 'day >= ?1 AND day <= ?2';
  const SUMS = `COALESCE(SUM(cost), 0) AS cost, COALESCE(SUM(impressions), 0) AS impressions,
                COALESCE(SUM(clicks), 0) AS clicks, COALESCE(SUM(conversions), 0) AS conversions`;
  const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  const [totals, previous, daily, camps, terms, termCount, wasted, keywords, devices, hours, actions, first] = await Promise.all([
    one(`SELECT ${SUMS}, COALESCE(SUM(value), 0) AS value FROM ads_days WHERE ${W}`, start, end),
    one(`SELECT ${SUMS}, COALESCE(SUM(value), 0) AS value FROM ads_days WHERE ${W}`, pStart, pEnd),
    q(`SELECT day, cost, impressions, clicks, conversions FROM ads_days WHERE ${W} ORDER BY day`, start, end),
    q(`SELECT campaign_id AS id, MAX(name) AS name, MAX(channel) AS channel, ${SUMS},
              SUM(eligible) AS eligible, SUM(lost_budget) AS lost_budget, SUM(lost_rank) AS lost_rank,
              SUM(CASE WHEN eligible IS NOT NULL THEN impressions ELSE 0 END) AS shown
         FROM ads_campaigns WHERE ${W} GROUP BY campaign_id ORDER BY cost DESC`, start, end),
    /* The searches that brought clicks first; a site with few clicks fills the
       list with what it was shown for. */
    q(`SELECT term, ${SUMS} FROM ads_terms WHERE ${W} GROUP BY term
        ORDER BY clicks DESC, conversions DESC, cost DESC, impressions DESC LIMIT 40`, start, end),
    one(`SELECT COUNT(DISTINCT term) AS n, COALESCE(SUM(CASE WHEN clicks > 0 THEN 1 ELSE 0 END), 0) AS clicked FROM
          (SELECT term, SUM(clicks) AS clicks FROM ads_terms WHERE ${W} GROUP BY term)`, start, end),
    /* Money that bought clicks and no lead — the list the negative keywords
       come from each week. */
    q(`SELECT term, ${SUMS} FROM ads_terms WHERE ${W} GROUP BY term
        HAVING SUM(conversions) = 0 AND SUM(cost) > 0 ORDER BY SUM(cost) DESC LIMIT 12`, start, end),
    q(`SELECT keyword_id AS id, MAX(text) AS text, MAX(match) AS match, MAX(ad_group) AS ad_group, MAX(status) AS status,
              (SELECT k2.qs FROM ads_keywords k2 WHERE k2.keyword_id = ads_keywords.keyword_id AND k2.qs IS NOT NULL ORDER BY k2.day DESC LIMIT 1) AS qs,
              ${SUMS}
         FROM ads_keywords WHERE ${W} GROUP BY keyword_id
        ORDER BY clicks DESC, impressions DESC LIMIT 25`, start, end),
    q(`SELECT device, ${SUMS} FROM ads_devices WHERE ${W} GROUP BY device ORDER BY clicks DESC, impressions DESC`, start, end),
    q(`SELECT hour, ${SUMS} FROM ads_hours WHERE ${W} GROUP BY hour ORDER BY hour`, start, end),
    q(`SELECT action, MAX(category) AS category, COALESCE(SUM(conversions), 0) AS conversions
         FROM ads_actions WHERE ${W} GROUP BY action ORDER BY conversions DESC`, start, end),
    one(`SELECT MIN(day) AS d FROM ads_days WHERE impressions > 0`),
  ]);

  const state = Object.fromEntries(parse(meta.campaigns, []).map((c) => [String(c.id), c]));
  return json({
    ok: true,
    days,
    ads: {
      customerId: meta.customer_id,
      name: meta.name || null,
      currency: meta.currency || 'USD',
      updatedAt: meta.updated_at || null,
      managedSince: meta.managed_since || null,
      firstDay: first.d || null,
      asOf,
      start, end,
      totals,
      previous,
      daily,
      campaigns: camps.map((c) => {
        const s = state[String(c.id)] || {};
        return {
          id: c.id, name: s.name || c.name, status: s.status || null, channel: s.channel || c.channel,
          bidding: s.bidding || null, budget: s.budget ?? null,
          cost: c.cost, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions,
          /* Of the impressions the campaign could have had, the share it got and
             the shares lost to budget and to rank. Null for a campaign type
             that reports none (Performance Max, Display). */
          share: c.eligible ? Math.min(1, c.shown / c.eligible) : null,
          lostBudget: c.eligible && c.lost_budget != null ? c.lost_budget / c.eligible : null,
          lostRank: c.eligible && c.lost_rank != null ? c.lost_rank / c.eligible : null,
        };
      }),
      /* Campaigns that exist but did not run in the window (paused, ended). */
      idle: Object.values(state).filter((s) => !camps.some((c) => String(c.id) === String(s.id))),
      terms,
      termCount: termCount.n || 0,
      termsClicked: termCount.clicked || 0,
      wasted,
      keywords,
      devices,
      hours,
      actions,
      goals: parse(meta.goals, []),
    },
    edge,
  });
}
