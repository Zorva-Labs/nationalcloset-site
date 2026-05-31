// Short opaque tokens for tokenized customer URLs (no login needed).
// 22 base64url chars = ~128 bits of entropy — secure against guessing.

export function genToken(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Per-year auto-increment for document numbers (EST-2026-0001 etc.)
export async function nextSequence(db, key) {
  // INSERT OR IGNORE then update + return — atomic enough for our volume
  await db.prepare(`INSERT OR IGNORE INTO sequences (key, next_value) VALUES (?1, 1)`).bind(key).run();
  // SQLite doesn't support RETURNING in all D1 versions; use read-then-write
  const row = await db.prepare(`SELECT next_value FROM sequences WHERE key = ?1`).bind(key).first();
  const value = row.next_value;
  await db.prepare(`UPDATE sequences SET next_value = next_value + 1 WHERE key = ?1`).bind(key).run();
  return value;
}

export function formatDocNumber(prefix, year, n) {
  return `${prefix}-${year}-${String(n).padStart(4, "0")}`;
}

// SHA-256 hex of an arbitrary string — used for signed-document hashing
export async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
