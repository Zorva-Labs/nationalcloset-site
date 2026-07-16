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
            duration_min, status, name, email, phone, site_address, rooms, notes, updated_at
       FROM appointments
       WHERE start_at >= ?1 AND start_at <= ?2
       ORDER BY start_at`
  ).bind(oneYearAgo, fiveYearsAhead).all();

  // Installs live as projects.install_date, not appointment rows — fold them in
  // as all-day events so the phone subscription shows them alongside consults.
  const oneYearAgoDay = oneYearAgo.slice(0, 10);
  const fiveYearsAheadDay = fiveYearsAhead.slice(0, 10);
  const installs = (await context.env.DB.prepare(
    `SELECT p.id, p.name AS project_name, p.install_date, p.status, p.updated_at, p.site_address,
            c.name AS contact_name, c.phone AS contact_phone
       FROM projects p LEFT JOIN contacts c ON c.id = p.contact_id
      WHERE p.install_date IS NOT NULL AND p.install_date >= ?1 AND p.install_date <= ?2`
  ).bind(oneYearAgoDay, fiveYearsAheadDay).all().catch(() => ({ results: [] }))).results || [];

  const installEvents = installs.map((p) => ({
    id: `install-${p.id}`,
    project_id: p.id,
    type: "install",
    all_day: true,
    start_at: p.install_date,          // date-only → rendered as an all-day VEVENT
    status: p.status,
    updated_at: p.updated_at,
    name: p.contact_name || p.project_name || "Install",
    phone: p.contact_phone || null,
    site_address: p.site_address || null,
    notes: p.project_name ? `Project: ${p.project_name}` : null,
  }));

  const ics = buildAppointmentFeed([...(results || []), ...installEvents]);
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
