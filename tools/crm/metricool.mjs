#!/usr/bin/env node
// Metricool → the CRM (Michael, 2026-11-20: "include … metricool").
//
// Metricool holds the Google Business Profile, Facebook and Instagram numbers
// and the posts scheduled through it. This Mac reads them over Metricool's HTTP
// API (METRICOOL_TOKEN, METRICOOL_USER_ID in ~/.env) and writes them into the live
// D1, where /crm/social shows them. Read only: nothing here posts, schedules or
// changes anything in Metricool or on a network.
//
//   node tools/crm/metricool.mjs sync [--days 90] [--blog <id>] [--dry-run]
//       the brand's connected networks, each network's daily figures for the last
//       --days days, and the posts from then to 30 days ahead
//   node tools/crm/metricool.mjs status
//
// The brand is site.json → social.metricool.blogId. National Closet Company has
// none yet (2026-11-20): a client goes on social only on Michael's yes, and the
// owner connects their own accounts through Metricool's link (/social). Until
// then a sync records "no brand" and the page says so.
//
// Runs daily from launchd (com.zorvalabs.ncc-metricool-sync, ~/bin/ncc-metricool-sync.sh).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ACCOUNT_ID = "90656e3c5d6b57a43d0b2bb60c53e5b0";
const DB_ID = "f5787ce4-29f9-43be-bf0e-cb486f1ec8e9";
const API = "https://app.metricool.com/api";
const TZ = "America/Chicago";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.env`, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  })
);
const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const has = (n) => argv.includes(`--${n}`);
const die = (m) => { console.error(m); process.exit(1); };
const DRY = has("dry-run");

// What the CRM keeps, per network: [subject, metric]. The field id stored is
// "<network>.<metric>". Business Profile first: it is where a closet customer
// calls from.
const METRICS = {
  gmb: [[null, "business_impressions_search"], [null, "business_impressions_maps"], [null, "call_clicks"],
        [null, "website_clicks"], [null, "business_direction_requests"], [null, "business_conversations"]],
  facebook: [["account", "pageFollows"], ["account", "pageViews"], ["account", "pageImpressions"],
             ["account", "postsCount"], ["account", "postsInteractions"]],
  instagram: [["account", "followers_gained"], ["account", "followers_lost"], ["account", "delta_followers"],
              ["account", "phone_call_clicks"], ["account", "postsCount"], ["account", "postsInteractions"]],
};

async function q(sql, params = []) {
  if (!env.CLOUDFLARE_API_TOKEN) die("CLOUDFLARE_API_TOKEN is not in ~/.env");
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) die(`D1: ${JSON.stringify(j.errors)}`);
  return j.result[0].results;
}
const write = (sql, params) => (DRY ? Promise.resolve([]) : q(sql, params));

async function mc(path, params = {}) {
  if (!env.METRICOOL_TOKEN || !env.METRICOOL_USER_ID) die("METRICOOL_TOKEN / METRICOOL_USER_ID are not in ~/.env");
  const u = new URL(API + path);
  u.searchParams.set("userId", env.METRICOOL_USER_ID);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { "X-Mc-Auth": env.METRICOOL_TOKEN, Accept: "application/json" } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${path} ${r.status}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

const day = (d) => d.toISOString().slice(0, 10);

async function sync() {
  const site = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8"));
  const blogId = opt("blog", site.social?.metricool?.blogId);
  if (!blogId) {
    await write(`INSERT INTO metricool_brand (id, blog_id, label, networks, synced_at) VALUES (1, NULL, NULL, NULL, datetime('now'))
                 ON CONFLICT(id) DO UPDATE SET blog_id = NULL, label = NULL, networks = NULL, synced_at = datetime('now')`);
    await write(`INSERT INTO metricool_sync (summary) VALUES (?)`, ["no Metricool brand for this site"]);
    console.log("No Metricool brand in site.json → social.metricool.blogId: nothing to read.");
    return;
  }

  const brands = await mc("/admin/simpleProfiles");
  const b = (Array.isArray(brands) ? brands : brands.data || []).find((x) => String(x.id) === String(blogId));
  if (!b) die(`Metricool has no brand ${blogId} on this account`);
  const networks = {};
  for (const n of ["gmb", "facebook", "instagram", "pinterest", "linkedinCompany", "tiktok", "youtube"]) if (b[n]) networks[n] = b[n];
  await write(`INSERT INTO metricool_brand (id, blog_id, label, networks, synced_at) VALUES (1, ?, ?, ?, datetime('now'))
               ON CONFLICT(id) DO UPDATE SET blog_id = excluded.blog_id, label = excluded.label, networks = excluded.networks, synced_at = excluded.synced_at`,
    [String(blogId), b.label || null, JSON.stringify(networks)]);

  const days = parseInt(opt("days", "90"), 10);
  const to = new Date(); const from = new Date(Date.now() - days * 86400e3);
  let values = 0; const misses = [];
  for (const [network, list] of Object.entries(METRICS)) {
    if (!networks[network]) continue;
    for (const [subject, metric] of list) {
      let d;
      try {
        d = await mc("/v2/analytics/timelines", { blogId, network, subject, metric, timezone: TZ,
          from: `${day(from)}T00:00:00`, to: `${day(to)}T23:59:59` });
      } catch (e) { misses.push(`${network}.${metric}`); console.error(`  ${network}.${metric}: ${e.message}`); continue; }
      const rows = (d.data || []).flatMap((s) => s.values || []).filter((v) => v && v.dateTime);
      // D1 takes up to 100 bound parameters a statement: 30 rows of 3.
      for (let i = 0; i < rows.length; i += 30) {
        const chunk = rows.slice(i, i + 30);
        await write(`INSERT INTO metricool_daily (day, field_id, value, synced_at) VALUES ${chunk.map(() => "(?, ?, ?, datetime('now'))").join(", ")}
                     ON CONFLICT(day, field_id) DO UPDATE SET value = excluded.value, synced_at = excluded.synced_at`,
          chunk.flatMap((v) => [String(v.dateTime).slice(0, 10), `${network}.${metric}`, v.value ?? null]));
      }
      values += rows.length;
    }
  }

  // Posts: from the window's start to 30 days ahead, one row per post and network.
  const ahead = new Date(Date.now() + 30 * 86400e3);
  const p = await mc("/v2/scheduler/posts", { blogId, start: `${day(from)}T00:00:00`, end: `${day(ahead)}T23:59:59`, timezone: TZ });
  let posts = 0;
  for (const post of p.data || []) {
    for (const pr of post.providers || []) {
      await write(`INSERT INTO metricool_posts (id, network, status, publish_at, text, url, media_url, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
                   ON CONFLICT(id) DO UPDATE SET status = excluded.status, publish_at = excluded.publish_at, text = excluded.text,
                     url = excluded.url, media_url = excluded.media_url, synced_at = excluded.synced_at`,
        [`${post.id}:${pr.network}`, pr.network, post.draft ? "DRAFT" : pr.status || null,
         String(post.publicationDate?.dateTime || "").replace("T", " ").slice(0, 16) || null,
         String(post.text || "").slice(0, 2000), pr.publicUrl || null, (post.media || [])[0] || null]);
      posts++;
    }
  }

  const summary = `${b.label}: ${Object.keys(networks).join(", ") || "no networks connected"} · ${values} daily values over ${days} days · ${posts} post(s)${misses.length ? ` · not read: ${misses.join(", ")}` : ""}`;
  await write(`INSERT INTO metricool_sync (summary) VALUES (?)`, [summary]);
  console.log((DRY ? "[dry run] " : "") + summary);
}

async function status() {
  const [b] = await q(`SELECT * FROM metricool_brand WHERE id = 1`);
  const [last] = await q(`SELECT ran_at, summary FROM metricool_sync ORDER BY id DESC LIMIT 1`);
  const [n] = await q(`SELECT COUNT(*) AS n, MAX(day) AS last FROM metricool_daily`);
  console.log(`Brand: ${b && b.blog_id ? `${b.label} (${b.blog_id}) · ${b.networks}` : "none"}`);
  console.log(`Daily values: ${n.n} (latest ${n.last || "—"})`);
  console.log(`Last sync: ${last ? last.ran_at + " UTC — " + last.summary : "never"}`);
}

const run = { sync, status }[cmd];
if (!run) die("usage: metricool.mjs sync [--days 90] [--blog <id>] [--dry-run] | status");
await run();
