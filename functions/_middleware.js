import { classifyChannel } from "./_lib/channel.js";
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

// This site does not log bots at all (below: bots skip the gate and the log), so a
// match here is simply not counted. isBot() stands in for the kit's botName().
// ad-review: Google's own review visits to ad landing pages (bin/add-ad-review.mjs patches this block into a site)
/* Google loads an ad's landing page from its own network with an ordinary
   browser user agent and a click id on the URL, when the ad is reviewed and
   from time to time after. No "AdsBot" in the user agent, so botName() cannot
   see it: on Blair Custom Interiors that was 18 of the first 40 click-id page
   views (2026-09-23/24, "Google LLC", New York) against 21 billed clicks, and
   the dashboard was counting Google's reviewer as ad traffic.
   Deliberately narrow: Google's own networks AND a click id AND no prefetch.
     - By network number, never by name. AS16591 is Google Fiber, an ordinary
       ISP with customers in Nashville, and its name starts with "Google" too.
     - AS15169 (Google LLC) and AS396982 (Google Cloud). People do not browse
       from these; the likely exception, Google's own VPN on a Pixel, is caught
       only when it also arrived from an ad, and then it shows in the bot table
       as one visit rather than disappearing.
     - Only with gclid / wbraid / gbraid. Google-network page views without one
       (renderers) are left alone.
     - Never a prefetch. Chrome fetches Google's results and ads before the
       click through Google's own proxy (Private Prefetch Proxy), so that fetch
       also comes from Google's network with the click id on it. But it is
       fetched for a person, and it says so: `Sec-Purpose: prefetch`. Filed as
       ad review, it got no attribution cookie. When the person opened the
       page, Chrome served its own copy, which never reached the server, and
       their form came out "Unknown" and was not counted as an ad lead
       (Blair Custom Interiors, 2026-09-24: two of the 53 Google-network
       fetches since 9/22 were opened by a person, one of them a lead).
   A match is a bot everywhere the caller uses the name: logged under it, given
   no attribution cookie, and, like AdsBot, never geo-blocked, because a 403 to
   Google's reviewer can cost the ad its approval.

   A prefetch is logged under prefetchBot() as "Chrome prefetch", not as a
   visit, because most are never opened. It still gets its attribution
   cookie, which Chrome stores only if the person opens the page. An opened
   one is counted by the page itself: the beacons script's `prefetched-view`
   block posts it to /api/pv-view. */
const GOOGLE_ASNS = new Set([15169, 396982]);
const isPrefetch = (request) =>
  /prefetch/i.test(request?.headers?.get('sec-purpose') || request?.headers?.get('purpose') || '');
const prefetchBot = (request) => (isPrefetch(request) ? 'Chrome prefetch' : null);
function adReviewBot(request, url) {
  if (isPrefetch(request)) return null;
  if (!GOOGLE_ASNS.has(Number(request?.cf?.asn))) return null;
  const q = url.searchParams;
  return q.get('gclid') || q.get('wbraid') || q.get('gbraid') ? 'Google ad review' : null;
}
// /ad-review

const REPO_INTERNAL = /^\/(tools|scripts|migrations|functions|\.claude|\.wrangler|node_modules)(\/|$)|^\/crm\/migrations\/|^\/crm\/setup-admin\.mjs$|^\/(CLAUDE\.md|CHANGELOG\.md|site\.json|wrangler\.toml|build\.mjs|package(-lock)?\.json|\.gitignore|\.indexnow\.json|\.dev\.vars)$|\.(sql|toml|py|log)$/i;

/* nationalcloset.pages.dev serves the same pages as nationalclosetco.com. It
   must never be indexed as a duplicate of the real domain: every response on a
   *.pages.dev host (deployment aliases included) leaves with noindex, whichever
   path below produced it; it keeps being served (it is the preview copy).
   Until 2026-09-23 it went out indexable, held back only by the canonical tag. */
export async function onRequest(context) {
  const res = await handle(context);
  if (!new URL(context.request.url).hostname.endsWith(".pages.dev")) return res;
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow");
  return out;
}

async function handle(context) {
  const { request, next } = context;
  const url = new URL(request.url);

  // 0) Repo internals: never served. Until 2026-09-23 the repo root was the
  //    deploy and they rode along (the manual, the changelog, site.json and
  //    .indexnow.json were public); build.mjs now deploys an allow-list (dist/)
  //    and this is the belt to that brace — it also answers 404 over any copy an
  //    edge cache still holds. Checked before the CRM bypass on purpose.
  if (REPO_INTERNAL.test(url.pathname)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  }

  // 0b) Short link printed on the review cards and used in the review emails.
  if (url.pathname === "/review" || url.pathname === "/review/") {
    return Response.redirect("https://g.page/r/Calj4533P4lBEBM/review", 302);
  }

  // 1) Owner / machine surfaces are never geo-blocked.
  if (isBypassPath(url.pathname)) return next();

  // 2) Search + AI crawlers are always allowed (any country).
  if (isBot(request.headers.get("user-agent")) || adReviewBot(request, url)) return next();

  // 3) Country gate. Cloudflare reliably sets request.cf.country at the edge.
  //    A missing value means we're not behind the CF edge (local dev / preview)
  //    — allow rather than risk false blocks.
  const country = (request.cf && request.cf.country) || request.headers.get("cf-ipcountry") || "";
  if (!country || ALLOWED_COUNTRIES.has(country)) {
    // Allowed visitor. Fetch the response first, then log the pageview ONLY if
    // it's a real page (200 + HTML) — so bot probes to non-existent URLs
    // (/contact, /wp-login, etc.) that 404 never pollute the traffic counts.
    const res = await next();
    try {
      const ct = (res && res.headers.get("content-type")) || "";
      /* A Chrome prefetch (Google's results and ads, `Sec-Purpose: prefetch`)
         is not a visit until someone opens it, and most never are. It stays
         behind the country gate but out of the edge log. An opened one runs
         js/main.js, so the engagement beacon counts it: page_engagement is
         the default traffic view here (traffic-kit, 2026-09-24). */
      if (res && res.status === 200 && ct.includes("text/html") && !isPrefetch(request)) {
        logPageview(context, url, country);
      }
    } catch (e) { /* never let logging affect the response */ }
    return res;
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
    // Never count admin/API or the internal /calc pricing tool as visitor traffic.
    if (p.startsWith("/api/") || p.startsWith("/crm/") || p === "/calc" || p === "/calc.html") return;
    // CRM / transactional document pages (invoice, proposal, contract, estimate)
    // are reached only by existing leads & customers via emailed token links —
    // that's not site traffic, so never count them.
    if (/^\/(invoice|proposal|contract|estimate)(\/|$)/.test(p)) return;

    const dest = req.headers.get("sec-fetch-dest");
    const accept = req.headers.get("accept") || "";
    const isDoc = dest === "document" || (dest == null && accept.includes("text/html"));
    if (!isDoc) return;

    const ourHost = url.hostname.replace(/^www\./, "").toLowerCase();
    let refHost = "";
    const ref = req.headers.get("referer") || "";
    if (ref) { try { refHost = new URL(ref).hostname.replace(/^www\./, "").toLowerCase(); } catch (e) {} }

    // Every public pageview is logged (so we get true per-page traffic and a
    // clean visitor count that already excludes /crm, bots and non-US). An
    // "entry" is a session-starting hit — external/empty referrer or an ad
    // click — versus internal navigation (referrer is our own host). Only
    // entries carry an acquisition channel.
    const isEntry = !(refHost && refHost === ourHost);
    const gclid = url.searchParams.get("gclid") || url.searchParams.get("wbraid") || url.searchParams.get("gbraid");
    const utmSource = url.searchParams.get("utm_source");
    const utmMedium = url.searchParams.get("utm_medium");
    const channel = isEntry ? classifyChannel(utmSource, gclid, refHost) : "Internal";

    const db = context.env && context.env.DB;
    if (!db) return;
    context.waitUntil(
      db.prepare(
        "INSERT INTO pageviews (path, channel, referrer_host, utm_source, utm_medium, gclid, country, is_entry, region) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)"
      ).bind(
        p.slice(0, 300), channel, refHost.slice(0, 120) || null,
        (utmSource || "").slice(0, 80) || null, (utmMedium || "").slice(0, 80) || null,
        gclid ? 1 : 0, (country || "").slice(0, 4) || null, isEntry ? 1 : 0,
        (((req.cf && req.cf.regionCode) || "").toString().slice(0, 8)) || null
      ).run().catch(() => {})
    );
  } catch (e) { /* never break the request over analytics */ }
}

// classifyChannel() lives in ./_lib/channel.js so the engagement beacon uses the same rules.
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
