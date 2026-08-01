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

  // 1) Honeypot — a hidden field a human never sees. If it's filled, it's a bot.
  if (g("company").trim() !== "") return "honeypot";

  const name = g("name");
  const message = g("message") || g("msg");

  // 2) Pasted link markup — bots only.
  if (MARKUP_RE.test(`${name} ${message}`)) return "markup";

  // 3) A "name" that is literally a URL.
  if (NAME_URL_RE.test(name)) return "name_url";

  return null;
}
