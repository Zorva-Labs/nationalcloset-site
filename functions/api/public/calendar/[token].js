// GET /api/public/calendar/[token].ics — iPhone / Google / Outlook subscription feed.
//
// Auth: token in the URL path matches env.CALENDAR_FEED_TOKEN. Treat this URL
// like a password — anyone with it can read all appointments. Rotate by
// changing the secret.
//
// Returns text/calendar (RFC 5545) with VEVENTs for every non-cancelled
// appointment in the DB. iPhone subscribes once and refreshes hourly.

import { buildAppointmentFeed } from "../../../_lib/ics-feed.js";

export async function onRequest(context) {
  // Strip a trailing ".ics" so the URL works with or without it
  const rawToken = context.params.token || "";
  const token = rawToken.replace(/\.ics$/i, "");
  const expected = context.env.CALENDAR_FEED_TOKEN;
  if (!expected) {
    return new Response("Calendar feed not configured", { status: 503 });
  }
  // Constant-time-ish comparison
  if (!token || token.length !== expected.length || token !== expected) {
    return new Response("Invalid token", { status: 401 });
  }

  // Pull all upcoming + recently past appointments (window: 1 year back, 5 years forward)
  // The iPhone caches the feed and shows everything in it, but giving it
  // unbounded history bloats the file. ±1y / +5y is plenty for a service biz.
  const now = new Date();
  const oneYearAgo = new Date(now.getTime() - 365 * 86400 * 1000).toISOString();
  const fiveYearsAhead = new Date(now.getTime() + 5 * 365 * 86400 * 1000).toISOString();

  const { results } = await context.env.DB.prepare(
    `SELECT id, contact_id, project_id, lead_id, type, start_at, end_at,
            duration_min, status, name, email, phone, site_address, rooms, notes
       FROM appointments
       WHERE start_at >= ?1 AND start_at <= ?2
       ORDER BY start_at`
  ).bind(oneYearAgo, fiveYearsAhead).all();

  const ics = buildAppointmentFeed(results || []);
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=\"nationalclosetco.ics\"",
      // Apple Calendar respects this even though it has its own REFRESH-INTERVAL
      "Cache-Control": "private, max-age=300", // edge caches 5min; clients refresh per X-PUBLISHED-TTL
    },
  });
}
