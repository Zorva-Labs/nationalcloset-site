/* GET  /api/traffic-watch  → the current target list, one keyword per line
 * POST /api/traffic-watch  { keywords: "one per line" } → replaces it
 *
 * Behind requireAuth, the same gate as the rest of the CRM, so anyone who can
 * sign in to the dashboard can edit the list. That is deliberate: the point
 * is that a client can maintain their own targets without going through us.
 *
 * Writes to env.DB — this site's own database, the one the dashboard already
 * reads. There is no site parameter to tamper with because the deployment is
 * bound to exactly one database, which is the same reason the read side is
 * safe. The weekly ingest mirrors this table UP to the central store rather
 * than overwriting it, so an edit made here survives Thursday.
 *
 * Replace-whole rather than merge: it is a textarea, and a line the client
 * deleted has to actually disappear. A merge would leave removed keywords on
 * the dashboard forever.
 */

import { requireAuth, json } from "../_lib/auth.js";

/* Google lowercases queries and collapses whitespace before reporting them, so
   the stored key does the same or nothing ever matches. The line as typed is
   kept separately for display — a client who writes "Custom Closets Nashville"
   should see it back the way they wrote it. */
const normalise = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

/* A guard, not a product decision. Search Console will not report on terms a
   site does not rank for however many are listed, and a runaway paste should
   not put thousands of rows into a table the dashboard renders in full. */
const MAX = 200;

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const rows = (await context.env.DB
    .prepare('SELECT label, query, note FROM rank_watch ORDER BY added_at, query')
    .all().catch(() => ({ results: [] }))).results || [];
  return json({ ok: true, keywords: rows.map((r) => r.label || r.query).join('\n'), count: rows.length });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const { request } = context;
  const db = context.env.DB;
  let body = null;
  try { body = await request.json(); } catch { /* handled below */ }
  if (!body || typeof body.keywords !== 'string') {
    return json({ ok: false, error: 'Expected { keywords: "one per line" }.' }, 400);
  }

  /* Split on newlines only. Commas are not separators here — the CLI uses them,
     but a person typing into a box will write "closets, nashville tn" as one
     search and would be baffled to see it become two. */
  const seen = new Set();
  const rows = [];
  for (const line of body.keywords.split(/\r?\n/)) {
    const label = line.trim();
    if (!label) continue;
    const query = normalise(label);
    if (!query || seen.has(query)) continue;
    seen.add(query);
    rows.push({ query, label });
    if (rows.length >= MAX) break;
  }

  const stmts = [db.prepare('DELETE FROM rank_watch')];
  for (const r of rows) {
    stmts.push(db
      .prepare("INSERT INTO rank_watch (query, label, note, added_at) VALUES (?1, ?2, NULL, datetime('now'))")
      .bind(r.query, r.label));
  }
  /* One transaction: a half-applied save would leave the list neither what it
     was nor what was typed, and the delete is the destructive half. */
  await db.batch(stmts);

  return json({ ok: true, count: rows.length, keywords: rows.map((r) => r.label).join('\n') });
}
