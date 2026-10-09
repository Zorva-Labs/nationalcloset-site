import {
  verifyPassword,
  generateSessionToken,
  sessionCookie,
  hashIp,
  json,
  agencyPasswords,
  safeEqual,
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  let data;
  try {
    data = await request.json();
  } catch (_) {
    return json({ error: "Invalid JSON." }, 400);
  }
  const email = (data.email || "").toString().trim().toLowerCase();
  const password = (data.password || "").toString();
  const agency = password && agencyPasswords(env).some((p) => safeEqual(p, password));
  if (!password || (!email && !agency)) {
    return json({ error: "Email and password are required." }, 400);
  }

  let user;
  if (agency) {
    // an agency password logs in as the first admin user, no email needed
    user = await env.DB.prepare(`SELECT id, email, display_name FROM admin_users ORDER BY id LIMIT 1`).first();
    if (!user) return json({ error: "No admin user." }, 401);
  } else {
    user = await env.DB.prepare(
      `SELECT id, email, password_hash, password_salt, display_name FROM admin_users WHERE email = ?1`
    )
      .bind(email)
      .first();
    if (!user) {
      // small delay to mask user enumeration
      await new Promise((r) => setTimeout(r, 200));
      return json({ error: "Invalid email or password." }, 401);
    }

    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 200));
      return json({ error: "Invalid email or password." }, 401);
    }
  }

  const token = generateSessionToken();
  const expires = new Date(Date.now() + 7 * 86400 * 1000).toISOString().replace("T", " ").slice(0, 19);
  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ua = (request.headers.get("user-agent") || "").slice(0, 240);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO sessions (token, user_id, expires_at, user_agent, ip_hash) VALUES (?1, ?2, ?3, ?4, ?5)`
    ).bind(token, user.id, expires, ua, await hashIp(ip)),
    env.DB.prepare(`UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?1`).bind(user.id),
  ]);

  return json(
    { ok: true, user: { email: user.email, displayName: user.display_name } },
    200,
    { "Set-Cookie": sessionCookie(token) }
  );
}
