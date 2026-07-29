// Shared spam heuristics for the public lead forms (/api/contact, /api/lead).
//
// Tuned for a LOCAL custom-closet business: a genuine consultation request is a
// homeowner describing a closet/pantry/garage. Real leads essentially never
// contain a URL, HTML/BBCode, or SEO/marketing vocabulary — so those are very
// high-precision spam signals with almost no false positives.
//
// spamReason(data) returns a short reason string when the submission looks like
// spam (callers should silently accept — return { ok: true } — so bots don't
// retry and no notification email is sent), or null when it looks legitimate.

// High-precision only — phrases a homeowner describing a closet would never use,
// but form-spam bots constantly do. (Ambiguous business-y phrases like "your
// website" are intentionally excluded so a real customer who mentions the site
// is never dropped; links + these keywords are enough.)
const SPAM_PHRASES = [
  "seo", "backlink", "back link", "guest post", "guest blog", "link building",
  "rank your website", "ranking on google", "first page of google",
  "page one of google", "top of google search", "website traffic",
  "domain authority", "affordable seo", "cheap seo", "digital marketing agency",
  "marketing agency", "lead generation service", "b2b leads", "cold email",
  "crypto", "bitcoin", "forex", "casino", "viagra", "cialis", "payday loan",
  "escort", "telegram", "whatsapp me", "ai automation agency",
  "chatgpt integration", "n8n workflow",
];

// Any URL-ish token: http(s)://, www., or a bare domain with a common TLD.
const LINK_RE = /(https?:\/\/|www\.[a-z0-9-]|\b[a-z0-9-]{2,}\.(com|net|org|ru|io|xyz|info|biz|top|online|site|shop|club|link|store|cn|de|uk)\b)/i;
// HTML anchors / BBCode / markdown link syntax that bots paste.
const MARKUP_RE = /(<a\s|<\/a>|\[url|\[\/url\]|\[link|href\s*=|\]\(http)/i;

export function spamReason(data) {
  const g = (k) => (data && data[k] != null ? String(data[k]) : "");

  // 1) Honeypot — a hidden field a human never sees. If it's filled, it's a bot.
  if (g("company").trim() !== "") return "honeypot";

  const name = g("name");
  const email = g("email");
  const message = g("message") || g("msg");
  const blob = `${name} ${message}`.toLowerCase();

  // 2) Links — the #1 signature of contact-form spam. A real closet lead never
  //    puts a URL in their name or message.
  if (LINK_RE.test(name) || LINK_RE.test(message)) return "link";
  if (MARKUP_RE.test(`${name} ${message}`)) return "markup";

  // 3) SEO / marketing / scam vocabulary.
  for (const p of SPAM_PHRASES) if (blob.includes(p)) return "phrase:" + p;

  // 4) Structural tells: a "name" that is actually an email/URL, or a message
  //    stuffed with links.
  if (/^\S+@\S+$/.test(name.trim())) return "name_is_email";
  if ((message.match(/https?:\/\//gi) || []).length >= 1) return "message_url";

  return null;
}
