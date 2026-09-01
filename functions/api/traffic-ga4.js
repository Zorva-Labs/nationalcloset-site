// GET /api/traffic-ga4 — what Google's own tag reports for this site.
//
// Read-only over the ga4_* tables that the central ingest
// (nashvilles-network/scripts/ga4-ingest.mjs) writes into this site's own D1.
// There is no central analytics store to reach into: each site's figures live
// in that site's database, so tenancy here is physical rather than a WHERE
// clause somebody has to remember.
//
// This is the cross-check on /api/traffic-channels, not a replacement for it.
// The edge log is blocker-proof and GA4 is not, so the two never agree exactly
// — GA4 typically reports 20-40% lower.
import { requireAuth, json } from "../_lib/auth.js";

// The tag that is live in every page's <head>. Hardcoded for the same reason
// the Cloudflare zone in traffic.js is: it names this one site, and a
// measurement ID is public — it identifies a stream, it authorizes nothing.
const MEASUREMENT_ID = "G-EJEDXZZWJN";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;

  // ga4_meta is created by the ingest on its first run. Absent means the
  // ingest has never run for this site — which is a different fault from "the
  // tag is not live" and different again from "nobody visited". The panel
  // reports which one, because all three render as three zeroes otherwise.
  const meta = await DB
    .prepare("SELECT value FROM ga4_meta WHERE key = 'measurement_id'")
    .first()
    .catch(() => null);
  if (!meta) return json({ measurementId: MEASUREMENT_ID, ingested: false, days: [], channels: [] });

  const asOf = await DB.prepare("SELECT MAX(day) AS d FROM ga4_days").first().catch(() => null);
  const days = (await DB.prepare(
    "SELECT day, sessions, users, views FROM ga4_days ORDER BY day"
  ).all().catch(() => ({}))).results || [];
  const channels = (await DB.prepare(
    "SELECT channel, SUM(sessions) AS sessions FROM ga4_channels GROUP BY channel ORDER BY sessions DESC"
  ).all().catch(() => ({}))).results || [];

  return json({
    measurementId: meta.value || MEASUREMENT_ID,
    ingested: true,
    asOf: asOf && asOf.d,
    days,
    channels,
  });
}
