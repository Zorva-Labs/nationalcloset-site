# `/crm/traffic` — the first-party dashboard

traffic-kit's tabbed page (Edge, Search Console, Analytics, Google Ads, Bing) ported into the CRM since 2026-10-06, behind the CRM sign-in (`NCC_CRM_PASSWORD`). It is the kit's standalone page, with a "CRM" link back in its top bar, not a page inside the CRM's sidebar.

- **`crm/traffic.html` is built, never edited:** `python3 tools/traffic/port.py` reads `~/traffic-kit/template/public/traffic/index.html` and applies anchored edits (the brand, the CRM sign-in, the Tennessee switch, forms in place of calls, the states card). Each anchor must match the count it expects or the port stops, so a kit change that moves one says so instead of shipping half-ported. `--check` runs it without writing. To take a new kit version: pull `~/traffic-kit`, run the port, check every tab in the browser pane, deploy.
- **Sign-in:** the page asks `/api/auth/me`, sends a signed-out visit to `/crm/login.html?next=…`, and signs out with `POST /api/auth/logout`. The kit's own password form is removed.
- **Tennessee switch:** All visitors / Tennessee in the masthead (`?tn=1`, kept across the range buttons and the tabs). It filters the visits to Cloudflare's region `TN`; the forms are not filtered.

## What the edge logs
- `functions/_middleware.js` logs a page view into D1 `pageviews` when a US visitor gets a 200 HTML page, before any script runs. It never logs `/crm/`, `/api/`, `/calc`, the document pages (`estimate`, `proposal`, `contract`, `invoice`) or a 404.
- It logs no bots at all. Crawlers, our own tools (`NashvillesWebDesignCheck` in the user agent), our scanners, the desktop app's preview browser, Google's fetchers that don't say "bot" and Google's ad review (Google's own networks, AS15169 and AS396982, with a click id and no prefetch header) pass the US gate and are not logged. Scripts (no browser engine in the user agent) and hosting networks are not logged either, but go through the gate like people.
- A Chrome prefetch (`Sec-Purpose: prefetch`) is not logged; if the person opens the page, `js/main.js`'s engagement beacon counts it.
- The blocks are traffic-kit's: `add-our-checks.mjs` and `add-not-people.mjs` patch theirs, but the `// ad-review:` block is refreshed by hand from the template, because this middleware skips bots before logging and sets no source cookie, so `add-ad-review.mjs` cannot patch it.

## The views
- `page_engagement` is written by `js/main.js`'s beacon (`/api/pv-time`): only a real browser running our script sends it, so it is the honest count and the default view.
- Judge performance on the Tennessee view (`?tn=1`) and forms per in-market visit; `pageviews` blog entries without a `page_engagement` beacon are bots. Many beacon visits come from Virginia, Washington, Oregon and New York, the states of the big hosting networks, and are most likely headless browsers that run the script: in the 30 days to 2026-10-06 only 19% of visits were from Tennessee.

## The endpoints (`functions/api/traffic/`, all behind the CRM's `requireAuth`)
- `_middleware.js` is the gate for the folder: the CRM sign-in, `data.db` (the kit's files read it), no-store and noindex. A file added to the folder is behind the sign-in by default.
- `data.js?days=N&tn=1` — the Edge, Search Console and Analytics tabs in one round trip, in the kit's shape. National Closet's port of the kit's `data.js`:
  - visits are `page_engagement` rows with a channel (the beacon has carried channel, entry and state since 2026-09-13; older rows are left out, not counted as Direct). The edge's `pageviews` is not read: it runs about three times higher with the bots that pass the gate;
  - conversions are the website's own `leads` rows (`source_page LIKE 'website%'`, never `crm-manual`), shaped as the kit's `form_complete` events by `functions/_lib/traffic-leads.js`, which credits each to a channel with the beacon's classifier (`_lib/channel.js`). Taps to call are not logged on this site, so the page shows no calls;
  - no crawlers (the middleware drops bots unlogged) and no devices (neither log keeps a user agent); the states card takes the devices' place, Tennessee in bold;
  - `totals.all_entries` is every visit whatever the switch, so the Analytics tab's "seen by Google's tag" compares GA4 with all visits, not Tennessee's;
  - the Cloudflare zone panel (GraphQL, the Pages secret `CF_ANALYTICS_TOKEN`), `rankings()` (the `rank_*` tables gsc-ingest writes weekly) and `analytics()` (the `ga4_*` tables of the central ingest, the cross-check, 20–40% below the edge) are the kit's.
- `ads.js?days=N&tn=1` — the Google Ads tab: the account's spend, clicks and conversions from the `ads_*` tables, beside the ad visits (`channel = 'Google Ads'` entries) and the forms from ads. Generated from the kit's `ads.js` with the same edge changes as `data.js`. The `ads_*` tables are written nightly by the ads-report sync (`~/fleet/skills/ads-report`, launchd `com.zorvalabs.ads-sync`), which picks this site up because `site.json → traffic.kit` is `traffic-kit` and its services include Google Ads. The campaign is paused (`docs/google-ads.md`), so the tab shows its last run.
- `watch.js` (the watched keywords, mirrored to the central store) and `bing.js` (the `bing_*` tables of gsc-ingest's nightly pull) are the kit's files byte for byte.
- `/api/traffic` (`functions/api/traffic.js`) stays for the CRM home page's edge panel (`crm/index.html`). The old `/api/traffic-channels`, `-rankings`, `-ga4`, `-watch` and `-bing` were removed on 2026-10-06.
