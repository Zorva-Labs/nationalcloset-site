// GET /api/traffic — true site traffic straight from Cloudflare's edge, so it's
// immune to ad blockers, GA filters, consent and reporting lag. Reads the last
// 8 days of zone pageviews/uniques via the Cloudflare GraphQL Analytics API.
// Credentials are server-side Pages secrets (CF_ANALYTICS_EMAIL/KEY) — never
// sent to the browser.
import { requireAuth, json } from "../_lib/auth.js";

const ZONE = "1d51a379abcf889e1f8a5445f6ed9b93"; // nationalclosetco.com

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { CF_ANALYTICS_EMAIL, CF_ANALYTICS_KEY } = context.env;
  if (!CF_ANALYTICS_EMAIL || !CF_ANALYTICS_KEY) return json({ days: [], error: "not_configured" });

  const DAY = 86400000;
  const iso = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const start = iso(new Date(now.getTime() - 7 * DAY));
  const end = iso(now);

  const query = `query {
    viewer { zones(filter: {zoneTag: "${ZONE}"}) {
      httpRequests1dGroups(limit: 10, filter: {date_geq: "${start}", date_leq: "${end}"}, orderBy: [date_ASC]) {
        dimensions { date }
        sum { pageViews requests }
        uniq { uniques }
      }
    } }
  }`;

  try {
    const r = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        "X-Auth-Email": CF_ANALYTICS_EMAIL,
        "X-Auth-Key": CF_ANALYTICS_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });
    const d = await r.json().catch(() => ({}));
    const groups = d?.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
    const days = groups.map((g) => ({
      date: g.dimensions.date,
      pageViews: g.sum?.pageViews || 0,
      uniques: g.uniq?.uniques || 0,
    }));
    return json({ days });
  } catch (e) {
    return json({ days: [], error: "fetch_failed" });
  }
}
