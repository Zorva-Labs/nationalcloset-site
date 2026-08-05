// GET /api/traffic?days=N — true site traffic from Cloudflare's edge, immune to
// ad blockers, GA filters, consent and reporting lag. Returns daily volume, a
// country breakdown (blocker-proof "traffic sources" — Cloudflare's free plan
// doesn't expose referrers), and traffic by hour of day in Central Time.
// Credentials are server-side Pages secrets — never sent to the browser.
import { requireAuth, json } from "../_lib/auth.js";

const ZONE = "1d51a379abcf889e1f8a5445f6ed9b93"; // nationalclosetco.com
const CT_OFFSET = 5; // Central Daylight Time = UTC-5 (Nashville / Middle TN)

async function cfGraphQL(env, query) {
  const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      "X-Auth-Email": env.CF_ANALYTICS_EMAIL,
      "X-Auth-Key": env.CF_ANALYTICS_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return r.json().catch(() => ({}));
}

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { env } = context;
  if (!env.CF_ANALYTICS_EMAIL || !env.CF_ANALYTICS_KEY) return json({ days: [], error: "not_configured" });

  const url = new URL(context.request.url);
  const today = url.searchParams.get("today") === "1";
  let span = parseInt(url.searchParams.get("days") || "7", 10);
  if (!Number.isFinite(span) || span < 1) span = 7;
  span = Math.min(span, 30);

  const DAY = 86400000;
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const isoDT = (d) => d.toISOString().slice(0, 19) + "Z";
  const start = today ? iso(now) : iso(new Date(now.getTime() - span * DAY));
  const end = iso(now);

  // Daily volume + per-country requests (summed across the range for sources).
  const dailyQ = `query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequests1dGroups(limit: 31, filter: {date_geq: "${start}", date_leq: "${end}"}, orderBy: [date_ASC]) {
      dimensions { date }
      sum { pageViews requests countryMap { clientCountryName requests } }
      uniq { uniques }
    }
  } } }`;

  // Hourly → aggregate into 24 local-hour buckets. Today only in today-mode,
  // else the last 3 days (Cloudflare's free plan caps this dataset at 3 days).
  // Central-time "today" boundary expressed in UTC. Cloudflare's daily buckets use
  // the UTC calendar date, so after 7pm Central (= next UTC day) the "today" bucket
  // looks empty. Compute "today" from hourly data over the Central calendar day.
  const ctNow = new Date(now.getTime() - CT_OFFSET * 3600 * 1000);
  const ctDate = ctNow.toISOString().slice(0, 10);
  const ctMidnightUTC = Date.parse(ctDate + "T00:00:00Z") + CT_OFFSET * 3600 * 1000;
  const hStart = today ? (new Date(ctMidnightUTC).toISOString().slice(0, 19) + "Z") : isoDT(new Date(now.getTime() - 3 * DAY));
  const hourlyQ = `query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequests1hGroups(limit: 200, filter: {datetime_geq: "${hStart}", datetime_leq: "${isoDT(now)}"}, orderBy: [datetime_ASC]) {
      dimensions { datetime }
      sum { pageViews countryMap { clientCountryName requests } }
      uniq { uniques }
    }
  } } }`;

  try {
    const [dailyRes, hourlyRes] = await Promise.all([cfGraphQL(env, dailyQ), cfGraphQL(env, hourlyQ)]);

    const groups = dailyRes?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    const days = groups.map((g) => ({
      date: g.dimensions.date,
      pageViews: g.sum?.pageViews || 0,
      uniques: g.uniq?.uniques || 0,
    }));

    // Hour-of-day buckets (Central Time) + Central "today" totals + today's country
    // map — all from hourly, which is the only source with sub-UTC-day resolution.
    const hourlyGroups = hourlyRes?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || [];
    const hours = new Array(24).fill(0);
    let todayPV = 0, todayUniq = 0;
    const hourlyCAgg = {};
    for (const g of hourlyGroups) {
      const utcHour = parseInt(String(g.dimensions.datetime).slice(11, 13), 10);
      if (Number.isFinite(utcHour)) {
        const local = ((utcHour - CT_OFFSET) % 24 + 24) % 24;
        hours[local] += g.sum?.pageViews || 0;
      }
      if (Date.parse(String(g.dimensions.datetime)) >= ctMidnightUTC) {
        todayPV += g.sum?.pageViews || 0;
        todayUniq += g.uniq?.uniques || 0;   // approx — hourly uniques can double-count a repeat visitor
        for (const c of g.sum?.countryMap || []) hourlyCAgg[c.clientCountryName] = (hourlyCAgg[c.clientCountryName] || 0) + (c.requests || 0);
      }
    }
    const hourly = hours.map((pageViews, hour) => ({ hour, pageViews }));

    // Country breakdown: in today-mode use hourly (Central day) — the UTC daily
    // bucket is near-empty after the 7pm-Central rollover; otherwise the daily range.
    const cAgg = {};
    if (today) {
      Object.assign(cAgg, hourlyCAgg);
    } else {
      for (const g of groups) for (const c of g.sum?.countryMap || []) cAgg[c.clientCountryName] = (cAgg[c.clientCountryName] || 0) + (c.requests || 0);
    }
    const countries = Object.entries(cAgg)
      .map(([code, requests]) => ({ code, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // US-vs-blocked split: US = allowed real audience; everything else = non-US
    // requests turned away with a 403 (overwhelmingly datacenter bots).
    let totalReq = 0;
    for (const k in cAgg) totalReq += cAgg[k];
    const usReq = cAgg["US"] || 0;
    const edge_split = { us: usReq, blocked: totalReq - usReq, total: totalReq };

    // "Today" mode: replace the misleading UTC daily bucket with Central-day totals.
    if (today) days.splice(0, days.length, { date: ctDate, pageViews: todayPV, uniques: todayUniq });

    return json({ days, countries, edge_split, hourly, tz: "America/Chicago" });
  } catch (e) {
    return json({ days: [], error: "fetch_failed" });
  }
}
