// Auth gate for every /api/traffic/* endpoint: the CRM's own sign-in.
//
// traffic-kit's tabbed dashboard (crm/traffic.html) reads four endpoints here:
// data, watch, bing and ads. watch.js and bing.js are the kit's files byte for
// byte, so this middleware hands them what the kit's own middleware would: the
// signed-in check and `data.db`. Living beside the endpoints means a file added
// to this folder later is behind the sign-in by default. It also covers
// /api/traffic itself (traffic.js, the home page's edge panel), which checks
// the sign-in on its own as well.

import { requireAuth } from "../../_lib/auth.js";

export async function onRequest(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  if (!context.env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "The CRM database is not bound on this deployment." }), {
      status: 500, headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
  context.data.db = context.env.DB;

  const res = await context.next();
  const headers = new Headers(res.headers);
  headers.set("cache-control", "no-store");
  headers.set("x-robots-tag", "noindex, nofollow");
  return new Response(res.body, { status: res.status, headers });
}
