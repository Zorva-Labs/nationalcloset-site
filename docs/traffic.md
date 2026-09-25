# `/crm/traffic` — the first-party dashboard

A bespoke page inside the CRM (`crm/traffic.html`), behind the CRM sign-in (`NCC_CRM_PASSWORD`). It is not traffic-kit's page, but its blocks come from traffic-kit and are ported by hand where this code differs (`CHANGELOG.md` has each port).

## What the edge logs
- `functions/_middleware.js` logs a page view into D1 `pageviews` when a US visitor gets a 200 HTML page, before any script runs. It never logs `/crm/`, `/api/`, `/calc`, the document pages (`estimate`, `proposal`, `contract`, `invoice`) or a 404.
- It logs no bots at all. Crawlers, our own tools (`NashvillesWebDesignCheck` in the user agent), our scanners, the desktop app's preview browser, Google's fetchers that don't say "bot" and Google's ad review (Google's own networks, AS15169 and AS396982, with a click id and no prefetch header) pass the US gate and are not logged. Scripts (no browser engine in the user agent) and hosting networks are not logged either, but go through the gate like people.
- A Chrome prefetch (`Sec-Purpose: prefetch`) is not logged; if the person opens the page, `js/main.js`'s engagement beacon counts it.
- The blocks are traffic-kit's: `add-our-checks.mjs` and `add-not-people.mjs` patch theirs, but the `// ad-review:` block is refreshed by hand from the template, because this middleware skips bots before logging and sets no source cookie, so `add-ad-review.mjs` cannot patch it.

## The views
- `page_engagement` is written by `js/main.js`'s beacon (`/api/pv-time`): only a real browser running our script sends it, so it is the honest count and the default view.
- Judge performance on the humans/Tennessee view (`?view=humans&tn=1`) and leads per in-market visit; `pageviews` blog entries without a `page_engagement` beacon are bots.

## The panels (each behind the CRM's `requireAuth`)
- `/api/traffic`: the edge panel, Cloudflare's zone analytics over GraphQL, read with the Pages secret `CF_ANALYTICS_TOKEN`. The code still falls back to `CF_ANALYTICS_EMAIL` + `CF_ANALYTICS_KEY`, but neither is set any more.
- `/api/traffic-channels?view=humans|all&tn=1`: channels and pages from the first-party log.
- `/api/traffic-rankings` (`functions/api/traffic-rankings.js`) and `/api/traffic-watch`: Search Console positions, written weekly into this D1 by gsc-ingest (`rank_*`), and the watched-keyword list, editable on the page and mirrored up to the central store.
- `/api/traffic-ga4`: GA4 from the `ga4_*` tables the central ingest writes, the cross-check (it runs 20–40% below the edge).
- `/api/traffic-bing`: Bing Webmaster Tools from the `bing_*` tables of gsc-ingest's nightly pull. It is traffic-kit's endpoint ported by hand (the header, `requireAuth` from `../_lib/auth.js`, `context.env.DB`), since `/api` here has no directory middleware.
