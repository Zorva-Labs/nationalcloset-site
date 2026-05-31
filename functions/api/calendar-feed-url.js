// GET /api/calendar-feed-url — returns the subscribe URL for the logged-in admin.
// Auth-gated so the token doesn't ship in the HTML for anonymous visitors.

import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const token = context.env.CALENDAR_FEED_TOKEN;
  if (!token) {
    return json({ error: "CALENDAR_FEED_TOKEN is not configured" }, 503);
  }
  const url = `https://nationalclosetco.com/api/public/calendar/${token}.ics`;
  return json({ url });
}
