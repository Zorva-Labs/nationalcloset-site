// GET /api/traffic-channels?days=N — real acquisition channels for site
// visitors, from the server-side pageview log (see functions/_middleware.js).
// Blocker-proof and GA-independent: counts public-page entries by channel
// (Google Ads, Google organic, Facebook/Instagram, AI search, Direct, referral).
import { requireAuth, json } from "../_lib/auth.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  let span = parseInt(url.searchParams.get("days") || "30", 10);
  if (!Number.isFinite(span) || span < 1) span = 30;
  span = Math.min(span, 90);

  const rows = (await context.env.DB.prepare(
    `SELECT channel, COUNT(*) AS n
       FROM pageviews
      WHERE created_at >= datetime('now', ?1)
      GROUP BY channel
      ORDER BY n DESC`
  ).bind(`-${span} days`).all().catch(() => ({ results: [] }))).results || [];

  const total = rows.reduce((s, r) => s + (r.n || 0), 0);
  return json({ channels: rows, total, days: span });
}
