// POST /api/pv-time — first-party engagement beacon (from js/main.js).
// Records how many active seconds a visitor spent on a page. Public + no auth
// (it's a visitor beacon), same-origin so ad blockers don't touch it. Always
// answers 204 — the browser's sendBeacon ignores the body. Input is validated
// and /crm + /api paths are ignored so only real page time is stored.
export async function onRequestPost(context) {
  try {
    const raw = await context.request.text().catch(() => "");
    let body = null;
    try { body = JSON.parse(raw); } catch (e) {}
    if (!body) return new Response(null, { status: 204 });

    const path = String(body.p || "").slice(0, 300);
    const secs = parseInt(body.s, 10);
    if (!path || path.startsWith("/crm") || path.startsWith("/api")) return new Response(null, { status: 204 });
    if (!Number.isFinite(secs) || secs < 1 || secs > 3600) return new Response(null, { status: 204 });

    const country = (context.request.cf && context.request.cf.country) || "";
    const db = context.env && context.env.DB;
    if (db) {
      context.waitUntil(
        db.prepare("INSERT INTO page_engagement (path, seconds, country) VALUES (?1,?2,?3)")
          .bind(path, secs, country.slice(0, 4) || null).run().catch(() => {})
      );
    }
  } catch (e) { /* never surface an error to a beacon */ }
  return new Response(null, { status: 204 });
}

// A no-op GET so accidental navigations don't 404 noisily.
export function onRequestGet() { return new Response(null, { status: 204 }); }
