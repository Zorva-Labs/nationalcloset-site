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
  // our-checks: our own tools and checks, never counted (bin/add-our-checks.mjs keeps this block current)
  "nashvilleswebdesigncheck", "nashvilleswebdesignscanner", "zorvalabsscanner", "zorvalabs", "zorva-labs", "claude/",
  // /our-checks
  // google-fetchers: Google's fetchers that don't say bot, never counted (bin/add-our-checks.mjs keeps this block current)
  "google-adwords", "google-ads-creatives", "google-businesslinkverification", "google-read-aloud", "google-safety", "google-agent", "google-notebooklm", "google-gemininotebook", "google-site-verification", "google-cloudvertexbot", "google-cws", "google-pinpoint", "googleproducer", "googlemessages", "google-apps-script", "apps-spreadsheets", "appengine-google", "google favicon", "google web preview", "google wap proxy",
  // /google-fetchers
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
  return s === "google" || BOT_UA.some((b) => s.includes(b));   // google-exact: a Google fetcher that sends only "Google"
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

// not-people: scripts and hosting networks, logged as bots but otherwise treated as people (bin/add-not-people.mjs patches this block into a site)
/* Michael's call, 2026-09-25, after an audit of what /traffic counted as people (traffic-kit CHANGELOG):
     - Script: a user agent with no browser engine in it. Every browser names one (AppleWebKit, Gecko or
       Trident); "node", aiohttp, axios, a bare "Mozilla/5.0" and "Mozilla/5.0 (compatible; X)" don't.
       A week of Cloudflare's own logs on three sites held no real browser without one.
     - Hosting network: a request from a data-center network, where bots and scrapers run. Across all 66
       databases they were about 58% of the entries counted as people, and the page's own engagement beacon
       came back for 2 to 3% of them, against 30 to 70% on home ISPs. Never the networks people browse
       through: iCloud Private Relay and WARP (Cloudflare, Akamai, Fastly), office security proxies, Google's
       own network (its prefetch proxy and ad review are named above) and Meta's (the Facebook app's browser
       can go out through it). The cost: someone on a commercial VPN that exits in a data center is logged
       here, not as a visit.
   A label, never a gate. The caller puts it on the logged row only. The geo gate and the source cookie still
   treat these requests as people, so a VPN user's call or form keeps where they came from, and a scraper
   abroad still gets the 403 (a named bot is let through). */
const scriptBot = (ua) => (ua && !/applewebkit\/|gecko\/|trident\//i.test(ua) ? 'Script' : null);
// hosting-asns: made by bin/hosting-asns.mjs (brianhama/bad-asn-list, MIT, + 27 of ours − 25 people networks) — edit there, not here
const HOSTING_ASNS = new Set([
  1442, 3223, 3561, 3722, 3842, 4229, 4250, 4694, 4851, 5577, 6188, 6724, 6870, 6939, 7203, 7349,
  7489, 7506, 7595, 7598, 7979, 8075, 8100, 8455, 8477, 8556, 8560, 8972, 9009, 9166, 9290, 9370,
  9412, 9667, 9823, 9925, 10200, 10207, 10439, 10532, 10929, 11230, 11235, 11274, 11588, 11831, 11878, 12586,
  12617, 12876, 12989, 13209, 13213, 13647, 13739, 13909, 13926, 13955, 14061, 14120, 14127, 14160, 14244, 14384,
  14415, 14442, 14567, 14576, 14618, 14708, 14956, 14986, 14987, 14992, 15003, 15083, 15189, 15395, 15497, 15510,
  15626, 15734, 15919, 16125, 16262, 16276, 16284, 16397, 16509, 16535, 16628, 16862, 16973, 17019, 17216, 17439,
  17669, 17881, 17918, 17920, 17971, 18120, 18450, 18570, 18779, 18978, 19084, 19133, 19234, 19318, 19437, 19531,
  19624, 19844, 19871, 19969, 20021, 20068, 20248, 20264, 20401, 20448, 20450, 20454, 20473, 20598, 20692, 20738,
  20773, 20836, 20860, 21100, 21159, 21217, 21321, 21859, 22152, 22363, 22400, 22552, 22611, 22612, 22720, 22781,
  22903, 23033, 23052, 23108, 23273, 23342, 23352, 23535, 23881, 24220, 24381, 24482, 24549, 24558, 24611, 24679,
  24725, 24768, 24875, 24931, 24940, 24958, 24961, 24971, 24997, 25048, 25128, 25163, 25260, 25369, 25379, 25532,
  25642, 25780, 25820, 25926, 26277, 26481, 26484, 26496, 26666, 26978, 27175, 27223, 27229, 27257, 27357, 27589,
  27597, 27640, 28099, 28216, 28333, 28747, 28753, 28855, 28997, 29066, 29067, 29073, 29097, 29119, 29140, 29182,
  29302, 29311, 29331, 29354, 29452, 29465, 29550, 29691, 29713, 29748, 29802, 29854, 29869, 29883, 30083, 30152,
  30176, 30235, 30475, 30633, 30693, 30849, 30900, 30998, 31103, 31240, 31472, 31590, 31659, 31698, 31898, 31981,
  32097, 32181, 32244, 32275, 32306, 32338, 32400, 32475, 32489, 32613, 32647, 32740, 32780, 32911, 33070, 33083,
  33182, 33251, 33260, 33302, 33322, 33330, 33387, 33438, 33480, 33552, 33569, 33724, 33785, 33891, 34305, 34432,
  34541, 34649, 34745, 34971, 34989, 35017, 35278, 35295, 35366, 35415, 35467, 35470, 35662, 35908, 35914, 35916,
  35974, 36007, 36024, 36114, 36236, 36351, 36352, 36408, 36536, 36666, 36791, 36873, 36887, 36920, 36970, 37018,
  37088, 37153, 37209, 37230, 37248, 37269, 37280, 37308, 37347, 37377, 37472, 37506, 37521, 37540, 37643, 37661,
  37692, 37714, 37963, 38001, 38107, 38279, 38894, 39020, 39326, 39351, 39392, 39451, 39458, 39572, 39704, 39756,
  39839, 40156, 40244, 40281, 40374, 40438, 40539, 40676, 40715, 40728, 40819, 40824, 40861, 41062, 41079, 41369,
  41427, 41562, 41653, 41665, 42120, 42160, 42210, 42244, 42311, 42331, 42399, 42400, 42418, 42442, 42465, 42473,
  42612, 42622, 42695, 42699, 42705, 42708, 42730, 42776, 42831, 43021, 43146, 43198, 43289, 43317, 43350, 43472,
  43541, 43620, 44050, 44066, 44398, 44901, 45090, 45102, 45152, 45179, 45187, 45201, 45470, 45481, 45486, 45577,
  45671, 45693, 45815, 45887, 46177, 46260, 46261, 46430, 46433, 46475, 46562, 46664, 46805, 46816, 46844, 46873,
  46945, 47143, 47161, 47172, 47205, 47328, 47385, 47447, 47549, 47577, 47583, 47588, 47625, 48031, 48093, 48446,
  48812, 48825, 48896, 49313, 49349, 49453, 49485, 49505, 49532, 49544, 49693, 49815, 49834, 49949, 49981, 50297,
  50465, 50495, 50608, 50613, 50655, 50673, 50872, 50915, 50926, 50968, 50986, 51050, 51109, 51159, 51167, 51191,
  51241, 51248, 51290, 51294, 51395, 51430, 51447, 51698, 51731, 51765, 51852, 52048, 52173, 52219, 52236, 52270,
  52321, 52335, 52347, 52465, 52674, 52925, 53013, 53055, 53057, 53101, 53221, 53225, 53281, 53332, 53340, 53342,
  53370, 53559, 53589, 53597, 53667, 53755, 53850, 53889, 53914, 53918, 54104, 54203, 54290, 54334, 54455, 54489,
  54500, 54527, 54540, 54555, 54641, 54817, 54825, 54839, 55051, 55225, 55229, 55286, 55293, 55536, 55720, 55761,
  55799, 55933, 55967, 56106, 56110, 56322, 56617, 56630, 56732, 56784, 56799, 56934, 57043, 57169, 57230, 57286,
  57345, 57363, 57669, 57682, 57752, 57773, 57858, 57879, 58073, 58113, 58305, 58667, 58797, 58922, 58936, 59135,
  59253, 59349, 59432, 59504, 59554, 59615, 59632, 59677, 59705, 59729, 59764, 59791, 59795, 59816, 59854, 60011,
  60068, 60117, 60118, 60404, 60476, 60485, 60505, 60558, 60567, 60739, 60781, 60800, 61102, 61107, 61147, 61157,
  61280, 61317, 61412, 61440, 62026, 62049, 62071, 62082, 62088, 62217, 62240, 62282, 62310, 62370, 62471, 62540,
  62563, 62567, 62605, 62651, 62756, 62838, 62874, 62899, 63008, 63018, 63119, 63128, 63129, 63199, 63213, 63473,
  63916, 63949, 64245, 64286, 64484, 132070, 132071, 132203, 132225, 132425, 132509, 132717, 132779, 132816, 132869, 133120,
  133143, 133229, 133296, 133393, 133480, 133752, 134451, 135822, 136258, 149428, 150436, 152950, 196645, 196678, 196745, 196827,
  197155, 197328, 197372, 197395, 197439, 197540, 197648, 197902, 197914, 198047, 198153, 198171, 198310, 198313, 198347, 198375,
  198414, 198432, 198651, 198968, 199129, 199213, 199481, 199653, 199733, 199847, 199883, 199990, 199997, 200000, 200019, 200039,
  200147, 200532, 200904, 201011, 201200, 201449, 201525, 201553, 201597, 201630, 201634, 201670, 201702, 201709, 201862, 201983,
  202023, 202053, 202118, 202836, 203523, 203629, 204196, 205659, 205964, 206898, 209709, 212238, 212385, 262170, 262287, 262603,
  262978, 262990, 263032, 263093, 263237, 327705, 327784, 327813, 328035, 393326, 394256, 394380, 395089, 395111, 395978, 396982,
  398779, 400940, 402205, 402206, 402207,
]);
const HOSTING_ORGS = new Set([
  "6 collyer quay",
  "16 collyer quay",
  "16 collyer quay # 18-29 income at raffles",
  "earthmeta multimedia studios llc",
  "myacct ltd",
  "hostroyale technologies pvt ltd",
  "hostroyale llc",
  "hostpapa",
]);
// /hosting-asns
function hostingBot(request) {
  const cf = request?.cf || {};
  if (HOSTING_ASNS.has(Number(cf.asn))) return 'Hosting network';
  return HOSTING_ORGS.has(String(cf.asOrganization || '').trim().toLowerCase()) ? 'Hosting network' : null;
}
const notPerson = (request, ua) => scriptBot(ua) || hostingBot(request);
// /not-people

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
      if (res && res.status === 200 && ct.includes("text/html") && !isPrefetch(request) && !notPerson(request, request.headers.get("user-agent"))) {
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
