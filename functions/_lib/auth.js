// Shared auth + crypto helpers for the National Closet Company CRM.
// Pages Functions skips files in directories that start with "_".

const PBKDF2_ITERATIONS = 100_000;
const SESSION_DAYS = 7;
const COOKIE_NAME = "ss_session";

// --------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, base64 output)
// --------------------------------------------------------------
export async function hashPassword(password, saltB64) {
  const enc = new TextEncoder();
  const salt = b64ToBytes(saltB64);
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return bytesToB64(new Uint8Array(bits));
}

export function generateSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToB64(bytes);
}

export async function verifyPassword(password, saltB64, expectedHashB64) {
  const computed = await hashPassword(password, saltB64);
  // Constant-time-ish compare
  if (computed.length !== expectedHashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ expectedHashB64.charCodeAt(i);
  }
  return diff === 0;
}

// --------------------------------------------------------------
// Sessions
// --------------------------------------------------------------
export function generateSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url
  return bytesToB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function sessionCookie(token, { maxAgeSeconds = SESSION_DAYS * 86400 } = {}) {
  const attrs = [
    `${COOKIE_NAME}=${token}`,
    `Path=/`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Lax`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join("; ");
}

export function clearedSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function readSessionToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

// Look up the session in D1, return { user } or null if invalid/expired
export async function currentUser(request, db) {
  const token = readSessionToken(request);
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.display_name, s.expires_at
       FROM sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.token = ?1`
    )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at + "Z").getTime() < Date.now()) {
    // expired — clean up
    await db.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, displayName: row.display_name };
}

// --------------------------------------------------------------
// Route guards
// --------------------------------------------------------------
export async function requireAuth(context) {
  const user = await currentUser(context.request, context.env.DB);
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

// --------------------------------------------------------------
// Misc helpers
// --------------------------------------------------------------
export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

export async function hashIp(ip) {
  if (!ip) return null;
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(ip));
  return bytesToB64(new Uint8Array(buf)).slice(0, 22); // truncated, opaque
}

// --------------------------------------------------------------
// base64 helpers
// --------------------------------------------------------------
function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBytes(b64) {
  // accept base64 and base64url
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = s + "===".slice((s.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
