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
  const hStart = today ? (iso(now) + "T00:00:00Z") : isoDT(new Date(now.getTime() - 3 * DAY));
  const hourlyQ = `query { viewer { zones(filter: {zoneTag: "${ZONE}"}) {
    httpRequests1hGroups(limit: 200, filter: {datetime_geq: "${hStart}", datetime_leq: "${isoDT(now)}"}, orderBy: [datetime_ASC]) {
      dimensions { datetime }
      sum { pageViews }
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

    // Country breakdown — sum requests per country across the range.
    const cAgg = {};
    for (const g of groups) {
      for (const c of g.sum?.countryMap || []) {
        cAgg[c.clientCountryName] = (cAgg[c.clientCountryName] || 0) + (c.requests || 0);
      }
    }
    const countries = Object.entries(cAgg)
      .map(([code, requests]) => ({ code, requests }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10);

    // Hour-of-day buckets (Central Time), pageViews summed across 7 days.
    const hours = new Array(24).fill(0);
    for (const g of hourlyRes?.data?.viewer?.zones?.[0]?.httpRequests1hGroups || []) {
      const utcHour = parseInt(String(g.dimensions.datetime).slice(11, 13), 10);
      if (!Number.isFinite(utcHour)) continue;
      const local = ((utcHour - CT_OFFSET) % 24 + 24) % 24;
      hours[local] += g.sum?.pageViews || 0;
    }
    const hourly = hours.map((pageViews, hour) => ({ hour, pageViews }));

    return json({ days, countries, hourly, tz: "America/Chicago" });
  } catch (e) {
    return json({ days: [], error: "fetch_failed" });
  }
}
