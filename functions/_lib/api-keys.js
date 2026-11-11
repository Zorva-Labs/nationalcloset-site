// API keys for outside programs that post leads (migration 0085,
// functions/api/inbound/lead.js). A key looks like "ncck_" + 40 hex characters;
// only its SHA-256 is stored. Made, listed and revoked with
// `node tools/crm/api-key.mjs` (docs/crm.md → Inbound leads).

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The key from the request: Authorization: Bearer, X-API-Key, or — for a
// sender that cannot set headers (GoHighLevel's plain Webhook action) — an
// `api_key` field in the body or in its customData. Never from the query
// string, which lands in logs.
export function presentedKey(request, body) {
  const auth = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (auth) return auth;
  const x = (request.headers.get("X-API-Key") || "").trim();
  if (x) return x;
  const b = body && typeof body === "object" ? body : {};
  const c = b.customData && typeof b.customData === "object" ? b.customData : {};
  return String(b.api_key || c.api_key || "").trim();
}

// The live key row for a presented key, or null. Stamps its use.
export async function checkApiKey(db, key) {
  if (!db || !/^ncck_[0-9a-f]{40}$/.test(key || "")) return null;
  const row = await db.prepare(
    "SELECT id, name, source, brand FROM api_keys WHERE key_hash = ?1 AND revoked_at IS NULL"
  ).bind(await sha256Hex(key)).first();
  if (!row) return null;
  await db.prepare("UPDATE api_keys SET last_used_at = datetime('now'), use_count = use_count + 1 WHERE id = ?1")
    .bind(row.id).run().catch(() => {});
  return row;
}
