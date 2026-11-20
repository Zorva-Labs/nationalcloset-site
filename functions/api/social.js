// Social & Business Profile (Michael, 2026-11-20: "include … metricool"). Admin
// only: /api/social is not in _lib/roles.js. Reads what tools/crm/metricool.mjs
// wrote from Metricool; nothing here posts or changes anything.
//
// GET /api/social → { brand, last_sync, totals: { field: { cur, prev, latest } },
//                     daily: [{ day, field_id, value }] (90 days), posts }
import { requireAuth, json } from "../_lib/auth.js";

// Figures that are a level on the day (a follower count), not a count of events:
// the card shows the latest value, not a sum.
const LEVEL = new Set(["facebook.pageFollows"]);

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const DB = context.env.DB;
  const brand = await DB.prepare(`SELECT * FROM metricool_brand WHERE id = 1`).first();
  const last = await DB.prepare(`SELECT ran_at, summary FROM metricool_sync ORDER BY id DESC LIMIT 1`).first();
  const daily = (await DB.prepare(
    `SELECT day, field_id, value FROM metricool_daily WHERE day >= date('now', '-90 days') ORDER BY day`
  ).all()).results || [];
  const sums = (await DB.prepare(
    `SELECT field_id,
            SUM(CASE WHEN day >  date('now','-28 days') THEN value END) AS cur,
            SUM(CASE WHEN day <= date('now','-28 days') AND day > date('now','-56 days') THEN value END) AS prev
       FROM metricool_daily GROUP BY field_id`
  ).all()).results || [];
  const totals = {};
  for (const s of sums) totals[s.field_id] = { cur: s.cur, prev: s.prev };
  for (const f of LEVEL) {
    const row = await DB.prepare(`SELECT value FROM metricool_daily WHERE field_id = ? AND value IS NOT NULL ORDER BY day DESC LIMIT 1`).bind(f).first();
    const old = await DB.prepare(`SELECT value FROM metricool_daily WHERE field_id = ? AND value IS NOT NULL AND day <= date('now','-28 days') ORDER BY day DESC LIMIT 1`).bind(f).first();
    if (row) totals[f] = { latest: row.value, prev: old ? old.value : null, level: true };
  }
  const posts = (await DB.prepare(
    `SELECT id, network, status, publish_at, text, url FROM metricool_posts
      WHERE publish_at >= date('now','-60 days') ORDER BY publish_at DESC LIMIT 60`
  ).all()).results || [];
  return json({ brand: brand && brand.blog_id ? { ...brand, networks: JSON.parse(brand.networks || "{}") } : null, last_sync: last || null, totals, daily, posts });
}
