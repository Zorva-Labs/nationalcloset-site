// POST /api/pv-time — first-party engagement beacon (from js/main.js).
// Records how many active seconds a visitor spent on a page, plus — because a
// beacon only ever comes from a real browser running our script — the signals
// that make it the honest visitor count: whether this was a session entry, the
// acquisition channel (same classifier as the edge log) and the visitor's
// state. Public + no auth (it's a visitor beacon), same-origin so ad blockers
// don't touch it. Always answers 204 — the browser's sendBeacon ignores the
// body. Input is validated and /crm + /api paths are ignored.
import { classifyChannel } from "../_lib/channel.js";

export async function onRequestPost(context) {
  try {
    const raw = await context.request.text().catch(() => "");
    let body = null;
    try { body = JSON.parse(raw); } catch (e) {}
    if (!body) return new Response(null, { status: 204 });

    const path = String(body.p || "").slice(0, 300);
    const secs = parseInt(body.s, 10);
    const pvid = (String(body.id || "").slice(0, 40)) || null;
    if (!path || path.startsWith("/crm") || path.startsWith("/api")) return new Response(null, { status: 204 });
    if (!Number.isFinite(secs) || secs < 1 || secs > 3600) return new Response(null, { status: 204 });

    const cf = context.request.cf || {};
    const country = (cf.country || "").toString().slice(0, 4) || null;
    const region = (cf.regionCode || "").toString().slice(0, 8) || null;
    // Entry + channel, from what the page itself saw (referrer, utm, click id).
    const isEntry = body.e === 0 || body.e === "0" ? 0 : 1;
    const refHost = String(body.r || "").slice(0, 120).toLowerCase();
    const utmSource = String(body.u || "").slice(0, 80) || null;
    const gclid = body.g === 1 || body.g === "1" ? "1" : null;
    const channel = isEntry ? classifyChannel(utmSource, gclid, refHost) : "Internal";

    const db = context.env && context.env.DB;
    if (db) {
      // The beacon reports the running total several times per visit; keep the
      // MAX for each page instance so an early "tab hidden" doesn't undercount
      // someone who stays. The acquisition columns are set once, on insert.
      context.waitUntil(
        db.prepare(
          "INSERT INTO page_engagement (pvid, path, seconds, country, channel, is_entry, region) VALUES (?1,?2,?3,?4,?5,?6,?7) " +
          "ON CONFLICT(pvid) DO UPDATE SET seconds = excluded.seconds " +
          "WHERE excluded.seconds > page_engagement.seconds"
        ).bind(pvid, path, secs, country, channel, isEntry, region).run().catch(() => {})
      );
    }
  } catch (e) { /* never surface an error to a beacon */ }
  return new Response(null, { status: 204 });
}

// A no-op GET so accidental navigations don't 404 noisily.
export function onRequestGet() { return new Response(null, { status: 204 }); }
