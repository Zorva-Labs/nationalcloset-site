// GET /api/traffic-channels?days=N&view=humans|all&tn=1 — visitor analytics
// from our own first-party logs. Two views of the same site:
//   view=humans (default): pages that fired the on-page engagement beacon.
//     Only a real browser running our script does that, so crawlers and the
//     edge-level bot hits that inflate "Direct" never appear. Carries the same
//     channel as the edge log and the visitor's state (since 2026-09-13).
//   view=all: every HTML request the edge logged (functions/_middleware.js).
//     Blocker-proof, but it counts every bot Cloudflare let through.
//   tn=1 restricts both to visitors Cloudflare placed in Tennessee — the only
//     ones who can actually buy a closet.
import { requireAuth, json } from "../_lib/auth.js";
import { centralNow, centralMidnightUtc } from "../_lib/dates.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const today = url.searchParams.get("today") === "1";
  const view = url.searchParams.get("view") === "all" ? "all" : "humans";
  const tn = url.searchParams.get("tn") === "1";
  let span = parseInt(url.searchParams.get("days") || "30", 10);
  if (!Number.isFinite(span) || span < 1) span = 30;
  span = Math.min(span, 90);
  const DB = context.env.DB;

  // Today = since CENTRAL midnight (created_at is UTC; date('now') would use the
  // UTC day, which flips at 7pm Central and makes "today" look empty). Central
  // midnight in UTC comes from the IANA zone: 05:00 in daylight time, 06:00 in
  // standard. It is a timestamp we compute, written into the SQL rather than
  // bound, because the last query below takes no parameter.
  const midnightUtc = new Date(centralMidnightUtc(centralNow().date)).toISOString().slice(0, 19).replace("T", " ");
  const TF = today
    ? `created_at >= '${midnightUtc}'`
    : "created_at >= datetime('now', ?1)";
  const REGION = tn ? " AND region = 'TN'" : "";
  const binds = today ? [] : [`-${span} days`];
  const q = (sql) => { const st = DB.prepare(sql); return (binds.length ? st.bind(...binds) : st).all().catch(() => ({ results: [] })); };

  const src = view === "all" ? "pageviews" : "page_engagement";
  const entryCol = view === "all" ? "is_entry = 1" : "is_entry = 1 AND channel IS NOT NULL";
  const [channelsR, pagesR, totalsR, engPageR, engAllR, sinceR] = await Promise.all([
    q(`SELECT channel, COUNT(*) AS n FROM ${src}
        WHERE ${TF}${REGION} AND ${entryCol}
        GROUP BY channel ORDER BY n DESC`),
    q(`SELECT path, COUNT(*) AS n FROM ${src}
        WHERE ${TF}${REGION}
        GROUP BY path ORDER BY n DESC LIMIT 15`),
    q(`SELECT COUNT(*) AS visits, SUM(COALESCE(is_entry, 1)) AS entries FROM ${src}
        WHERE ${TF}${REGION}`),
    // Avg engagement seconds per page (from the first-party beacon).
    q(`SELECT path, ROUND(AVG(seconds)) AS avg_s, COUNT(*) AS samples FROM page_engagement
        WHERE ${TF}${REGION} GROUP BY path`),
    q(`SELECT ROUND(AVG(seconds)) AS avg_s, COUNT(*) AS samples FROM page_engagement
        WHERE ${TF}${REGION}`),
    // The beacon started carrying channel + region on 2026-09-13; the humans
    // view is blank before that, and the dashboard says so.
    q(`SELECT MIN(created_at) AS since FROM page_engagement WHERE channel IS NOT NULL`),
  ]);

  const channels = channelsR.results || [];
  const pages = pagesR.results || [];
  const t = (totalsR.results || [])[0] || {};
  const engByPath = {};
  for (const r of (engPageR.results || [])) engByPath[r.path] = r.avg_s || 0;
  const eng = (engAllR.results || [])[0] || {};
  const since = ((sinceR.results || [])[0] || {}).since || null;

  return json({
    view, tn, since,
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
