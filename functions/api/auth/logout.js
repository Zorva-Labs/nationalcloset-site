import { readSessionToken, clearedSessionCookie, json } from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const token = readSessionToken(request);
  if (token) {
    await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
  }
  return json({ ok: true }, 200, { "Set-Cookie": clearedSessionCookie() });
}
