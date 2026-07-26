// Geo-gate: the public site is reachable only from the United States.
//
// Always allowed regardless of country:
//   - Search / AI crawlers (Google, Bing, OpenAI, Anthropic, Perplexity, …) by
//     user-agent, so SEO + AEO/GEO indexing keeps working worldwide.
//   - Machine-to-machine + owner surfaces (Stripe webhook, internal cron, the
//     CRM and its auth/data API) so payments, automation, and admin login never
//     get blocked by geography (the CRM is auth-protected anyway).
//
// Everything else (marketing pages, customer portals, the public /api/public/*
// endpoints) is blocked outside the US with a 403.

const ALLOWED_COUNTRIES = new Set(["US"]);

// User-agent substrings (lowercase) for crawlers we always allow.
const BOT_UA = [
  // Google
  "googlebot", "google-extended", "googleother", "apis-google", "adsbot-google",
  "mediapartners-google", "google-inspectiontool", "storebot-google", "feedfetcher-google",
  // Microsoft / Bing
  "bingbot", "bingpreview", "msnbot", "adidxbot",
  // OpenAI
  "gptbot", "oai-searchbot", "chatgpt-user",
  // Anthropic (Claude)
  "claudebot", "claude-web", "claude-user", "claude-searchbot", "anthropic-ai",
  // Perplexity
  "perplexitybot", "perplexity-user",
  // Other popular AI / search crawlers
  "applebot", "amazonbot", "ccbot", "duckduckbot", "yandex", "baiduspider",
  "bytespider", "meta-externalagent", "facebookexternalhit", "cohere-ai",
  "diffbot", "petalbot", "ia_archiver", "slurp", "zorvalabsscanner",
];

// Static assets (images, css, js, fonts, icons, sitemap, etc.) must NEVER be
// geo-gated. There's no reason to block an image by country, and gating them
// breaks social-share previews: Facebook/LinkedIn fetch the og:image from
// their own datacenters, which may be outside the US/CA — a 403 there means
// the link shows no image.
const STATIC_EXT = /\.(png|jpe?g|webp|gif|svg|ico|avif|css|js|mjs|woff2?|ttf|otf|eot|map|txt|xml|webmanifest|json|pdf|mp4|webm)$/i;
function isStaticAsset(pathname) {
  return STATIC_EXT.test(pathname) ||
    pathname.startsWith("/img/") || pathname.startsWith("/css/") ||
    pathname.startsWith("/js/")  || pathname.startsWith("/assets/") ||
    pathname.startsWith("/fonts/");
}

// Path prefixes that bypass the geo gate entirely (server-to-server + owner).
function isBypassPath(pathname) {
  if (isStaticAsset(pathname)) return true;                 // images/css/js/fonts — never geo-block
  if (pathname.startsWith("/crm/")) return true;            // owner CRM (auth-gated)
  if (pathname.startsWith("/api/")) {
    // Allow the CRM data/auth/internal/webhook APIs; only the public-facing
    // /api/public/* endpoints are geo-restricted.
    return !pathname.startsWith("/api/public/");
  }
  return false;
}

function isBot(ua) {
  const s = (ua || "").toLowerCase();
  return BOT_UA.some((b) => s.includes(b));
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 1) Owner / machine surfaces are never geo-blocked.
  if (isBypassPath(url.pathname)) return next();

  // 2) Search + AI crawlers are always allowed (any country).
  if (isBot(request.headers.get("user-agent"))) return next();

  // 3) Country gate. Cloudflare reliably sets request.cf.country at the edge.
  //    A missing value means we're not behind the CF edge (local dev / preview)
  //    — allow rather than risk false blocks.
  const country = (request.cf && request.cf.country) || request.headers.get("cf-ipcountry") || "";
  if (!country || ALLOWED_COUNTRIES.has(country)) {
    // Allowed visitor → log the entry's acquisition channel (blocker-proof,
    // server-side). Side effect only; never blocks or breaks the response.
    logPageview(context, url, country);
    return next();
  }

  // 4) Outside the US → blocked.
  return new Response(blockedPage(), {
    status: 403,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

// Record a public-page ENTRY with its acquisition channel, straight into D1.
// Runs only for allowed (US) human visitors on real page navigations — bots
// are already returned above, static assets bypass, and internal navigations
// (referrer is our own host) are skipped so this counts entries, not clicks
// around the site. Wrapped so a failure can never affect the response.
function logPageview(context, url, country) {
  try {
    const req = context.request;
    if (req.method !== "GET") return;
    const p = url.pathname;
    if (p.startsWith("/api/") || p.startsWith("/crm/")) return;

    const dest = req.headers.get("sec-fetch-dest");
    const accept = req.headers.get("accept") || "";
    const isDoc = dest === "document" || (dest == null && accept.includes("text/html"));
    if (!isDoc) return;

    const ourHost = url.hostname.replace(/^www\./, "").toLowerCase();
    let refHost = "";
    const ref = req.headers.get("referer") || "";
    if (ref) { try { refHost = new URL(ref).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) {} }
    if (refHost && refHost === ourHost) return; // internal navigation, not an entry

    const gclid = url.searchParams.get("gclid") || url.searchParams.get("wbraid") || url.searchParams.get("gbraid");
    const utmSource = url.searchParams.get("utm_source");
    const utmMedium = url.searchParams.get("utm_medium");
    const channel = classifyChannel(utmSource, gclid, refHost);

    const db = context.env && context.env.DB;
    if (!db) return;
    context.waitUntil(
      db.prepare(
        "INSERT INTO pageviews (path, channel, referrer_host, utm_source, utm_medium, gclid, country) VALUES (?1,?2,?3,?4,?5,?6,?7)"
      ).bind(
        p.slice(0, 300), channel, refHost.slice(0, 120) || null,
        (utmSource || "").slice(0, 80) || null, (utmMedium || "").slice(0, 80) || null,
        gclid ? 1 : 0, (country || "").slice(0, 4) || null
      ).run().catch(() => {})
    );
  } catch (e) { /* never break the request over analytics */ }
}

// Map an entry to a marketing channel, most-specific first.
function classifyChannel(utmSource, gclid, refHost) {
  if (gclid) return "Google Ads";
  const s = (utmSource || "").toLowerCase();
  if (s) {
    if (s.includes("google")) return "Google Ads";
    if (s.includes("face") || s === "fb" || s.includes("meta") || s.includes("insta") || s === "ig") return "Facebook/Instagram";
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

function blockedPage() {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Available in the United States</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800&display=swap" rel="stylesheet"/>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#FAF9F6;color:#16140F;font-family:'Montserrat',system-ui,sans-serif;padding:24px}
  .card{max-width:440px;text-align:center}
  .card img{height:48px;margin-bottom:20px}
  h1{font-size:24px;font-weight:800;margin:0 0 10px}
  p{color:#6B6457;font-size:15px;line-height:1.6;margin:0 0 8px}
  a{color:#B9542F;font-weight:700;text-decoration:none}
</style></head>
<body><div class="card">
  <img src="/img/ncc-logo-nc.png" alt="National Closet Company"/>
  <h1>We're available in the United States</h1>
  <p>National Closet Company serves homeowners across the United States. This site isn't available in your region.</p>
  <p>If you believe you're seeing this in error, reach us at <a href="mailto:hello@nationalclosetco.com">hello@nationalclosetco.com</a> or <a href="tel:+16292988241">629-298-8241</a>.</p>
</div></body></html>`;
}
