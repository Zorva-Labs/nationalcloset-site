// Acquisition-channel classifier shared by the edge pageview log
// (functions/_middleware.js) and the on-page engagement beacon
// (functions/api/pv-time.js), so both count a visitor the same way.
export function classifyChannel(utmSource, gclid, refHost) {
  if (gclid) return "Google Ads";
  const s = (utmSource || "").toLowerCase();
  if (s) {
    if (s.includes("google")) return "Google Ads";
    // Facebook/Meta dynamic {{site_source_name}} placement codes.
    if (s === "an") return "Facebook Audience Network";
    if (s === "ig" || s.includes("insta")) return "Instagram";
    if (s === "msg" || s.includes("messenger")) return "Messenger";
    if (s === "fb" || s.includes("face") || s.includes("meta")) return "Facebook";
    if (s.includes("bing")) return "Bing";
    return utmSource;
  }
  const h = (refHost || "").toLowerCase();
  if (!h) return "Direct";
  if (h.includes("google")) return "Google (organic)";
  if (h.includes("bing")) return "Bing";
  if (h.includes("duckduckgo")) return "DuckDuckGo";
  if (h.includes("yahoo")) return "Yahoo";
  if (h.includes("facebook") || h.startsWith("fb.") || h.includes("instagram")) return "Facebook/Instagram";
  if (h.includes("chatgpt") || h.includes("openai") || h.includes("perplexity") || h.includes("claude") || h.includes("gemini") || h.includes("copilot")) return "AI search";
  if (h.includes("houzz")) return "Houzz";
  if (h.includes("yelp")) return "Yelp";
  if (h.includes("nextdoor")) return "Nextdoor";
  if (h.includes("t.co") || h.includes("twitter") || h.includes("x.com")) return "X/Twitter";
  return h; // any other referral host
}
