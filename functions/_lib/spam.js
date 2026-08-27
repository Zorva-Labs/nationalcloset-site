// Shared spam heuristics for the public lead forms (/api/contact, /api/lead).
//
// DELIBERATELY MINIMAL. A silently-dropped submission is invisible — the visitor
// is told "received" but nothing saves and no email is sent — so a false
// positive here is a LOST CUSTOMER. We therefore only drop on signals a real
// homeowner physically cannot or essentially never triggers:
//   1. the hidden honeypot field (a bot filled a field no human can see),
//   2. pasted HTML / BBCode / markdown LINK markup (<a href>, [url], ](http…),
//   3. a "name" that is literally a URL.
//
// Everything else now passes: keywords, a mentioned website or email, even a
// link in the message. Obvious junk that slips through can be marked "lost" in
// the CRM in two seconds — a far better trade than ever dropping a real client.
//
// spamReason(data) returns a short reason string for a drop, or null otherwise.

// HTML anchors / BBCode / markdown link syntax — pasted by bots, never by a real
// homeowner filling out a closet inquiry.
const MARKUP_RE = /(<a\s|<\/a>|\[url|\[\/url\]|\[link|href\s*=|\]\(https?:)/i;
// A name that is literally a URL (http(s):// or www.) — never a real person.
const NAME_URL_RE = /(https?:\/\/|www\.[a-z0-9-])/i;

export function spamReason(data) {
  const g = (k) => (data && data[k] != null ? String(data[k]) : "");

  const name = g("name");
  const message = g("message") || g("msg");

  // 2) Pasted link markup — bots only.
  if (MARKUP_RE.test(`${name} ${message}`)) return "markup";

  // 3) A "name" that is literally a URL.
  if (NAME_URL_RE.test(name)) return "name_url";

  return null;
}

// High-confidence BOT signals — a hidden honeypot field a human can't see, and a
// form submitted faster than a person can physically type. Near-zero false
// positives, so callers drop these SILENTLY (no team notification), unlike the
// fuzzy content heuristics in spamReason(). Returns a reason string or null.
//
// Both checks FAIL OPEN when their field is absent (old cached page, JS
// disabled): only an actually-filled honeypot or a genuinely-too-fast submit
// drops — a missing signal never blocks a real lead.
const MIN_FILL_MS = 2000; // a real person can't fill name+phone+email in <2s
export function botReason(data) {
  const g = (k) => (data && data[k] != null ? String(data[k]) : "");
  if (g("hp_url").trim()) return "honeypot";
  const ms = parseInt(g("hp_ms"), 10);
  if (Number.isFinite(ms) && ms >= 0 && ms < MIN_FILL_MS) return "too_fast";
  return null;
}

// Verify a Cloudflare Turnstile token server-side. Returns "turnstile_failed"
// ONLY when Turnstile explicitly rejects the token (a real bot signal). FAILS
// OPEN — returns null — on a missing secret, a missing token, or any network /
// parse error, so a real lead is NEVER dropped because verification couldn't run.
export async function turnstileReason(env, token, ip) {
  const secret = env && env.TURNSTILE_SECRET;
  if (!secret) return null;   // not configured on this site yet
  if (!token) return null;    // no token (JS blocked / not ready) — honeypot+timer cover this
  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", String(token));
    if (ip) body.set("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = await r.json().catch(() => null);
    if (out && out.success === false) {
      // A stale or reused token (a real customer who idled on the form past the
      // ~5-min token lifetime) reports "timeout-or-duplicate" — that's NOT a bot,
      // so fail open. Only other explicit failures count as a bot.
      const codes = out["error-codes"] || [];
      if (codes.includes("timeout-or-duplicate")) return null;
      return "turnstile_failed";
    }
    return null;
  } catch {
    return null; // network/parse error → fail open
  }
}
