# National Closet Company — operating manual

nationalclosetco.com · Cloudflare Pages `nationalcloset` · github.com/Zorva-Labs/nationalcloset-site · status: **live**

**Before changing anything:** read the top of `CHANGELOG.md`. **After:** append an entry there; if infrastructure changed (a secret, a database, a domain, an account id), update `site.json` and this file too. The rules that apply to every site are in `~/.claude/CLAUDE.md`; estate-wide facts (accounts, conventions, gotchas) are in `~/fleet/docs`.

## What this is
Marketing site + full CRM for National Closet Company (custom closets, pantries, garage storage and — since 2026-09-17 — custom cabinets; a division of Blair Custom Interiors, owners Michael and Noah Blair). ~70 pages: home (hero "ballpark" estimator, before/after slider, real Google reviews, price tiles, family strip, gallery teaser, projects, FAQs), `/gallery`, `/our-work`, `/about`, `/reviews`, `/faq`, `/custom-cabinets-nashville`, `/custom-pantry-nashville`, 19 city pages, 4 competitor "alternative" pages, pricing guide, warranty, "Closet Cases" blog, `/free-design` (noindex paid landing page), `/book` (self-booking), `/review` (302 to the Google review link). CRM at `/crm` with proposals, contracts, portal, scheduling, email sync, review requests and a traffic dashboard.

## Build & deploy
```bash
set -a; . ~/.env; set +a; unset CLOUDFLARE_API_TOKEN   # credentials live in ~/.env, never in the repo
git fetch origin && git rev-list --count HEAD..origin/main   # must print 0 before any build or deploy
npx wrangler pages deploy . --project-name=nationalcloset --branch=main --commit-dirty=true
```
- root deploy; pages are built/synced by tools/site-build/stage4.py (chrome sweep + page builds) — run it, review, deploy
- Or `node ~/fleet/bin/fleet.mjs deploy nationalcloset`, which does the same from `site.json` and refuses a checkout that is behind origin.
- Pages binds secrets at deploy time — after any `wrangler pages secret put`, deploy again.

## How it works
- **Page factory:** `tools/site-build/chrome.py` (header/drawer/footer lifted from the city page, nav list, reviews data, component builders, `page()`, `COMPARE_ROWS`) and `stage4.py` (idempotent chrome sweep + page builds + `sync_inline_css()`). Build any new page with it so the chrome stays identical; new pages inherit the two-field form and the three-button mobile bar.
- Components (`js/main.js` + `css/styles.css`): `[data-ba]` before/after slider, `[data-estimator]` + `[data-ballpark]` (ranges: walk-in from $2,000, pantry $1,000, reach-in $1,000, garage $2,500, office $2,000, laundry $1,500 — owner-set 2026-09-13), `[data-filters]`, `.cmp` compare table, `.gbadge`, `.tcard`, the `track()` layer firing GA4 `generate_lead`/`contact`/`consult_cta_click`/`estimate`/`booked_consultation` + Ads + Meta only on `success:true`.
- Header: parent-company bar (`.nav__parent`, `--nav-h` 100px on phones, 116px from 1100px); desktop inline nav starts at **1100px**, layout breakpoints stay at 940. Nav: Cabinets (3rd), Gallery, Our Work, Pricing, About, Reviews, Closet Cases.
- CRM (`crm/` UI, `functions/` API, `functions/_lib/`): leads → contacts → projects → proposals → contracts (custom_order / install_only / repair templates, D1 `document_templates` rows 1/5/6 hold the live wording — code has fallbacks) → invoices (Stripe) → jobs advanced by the cron; lifecycle in `_lib/lifecycle.js` (PAYMENT_SCHEDULE 50/25/25, FALLBACK_TERMS lifetime warranty); review requests in `_lib/review-requests.js` (completed projects 12 h+, design visits 2+ days, 9am–8pm CT, once per contact per 90 days, email only — **no SMS, owner declined Twilio**); `_lib/email.js` checks recipient domains over DoH and never sends spoof-shaped self-mail.
- Scheduling: Worker `nationalcloset-email-cron` (`~/nationalcloset-cron`, `*/3 * * * *`) POSTs `/api/internal/email-sync`, `/advance-jobs`, `/proposal-expiry` with `Authorization: Bearer $NCC_CRON_SECRET`. Daily launchd job `com.zorvalabs.ncc-ads-conversions` (07:15 CT): `scripts/ads-offline-conversions.mjs` (booked consults → GA4 MP `booked_consultation` → Ads import, 70 h window, ledger `ads_conversion_uploads`), `ads-adgroup-cutover.mjs`, `ads-guard.mjs` (restores TARGET_SPEND/$14 cap, Search-only, paused old ad group, paused auto-apply). `scripts/ads-landing-test.mjs --report/--end` (homepage-vs-/free-design RSA test; decide ~2026-10-04). `scripts/adsapi.py` pattern: assert the customer name, validateOnly, then apply.
- Google Ads state (2026-09-13): campaign 24052252978 "NCC Search Campaign", Maximize Clicks with a **$14 CPC ceiling**, $130/day, presence-only geo on Davidson/Williamson/Rutherford/Sumner/Wilson, six phrase-match intent ad groups → `/free-design` (pantry → `/custom-pantry-nashville`), ~190 negatives, schedule 06:00–24:00, all four auto-apply subscriptions paused. Baselines: CTR 6.8%, CPC $10.30, IS 38%.

## Infrastructure & accounts
- Cloudflare Pages project `nationalcloset` → nationalcloset.pages.dev; domain nationalclosetco.com.
- R2: `nationalcloset-files` as `FILES`.
- Workers: `nationalcloset-email-cron`.
- Secrets (names only — values in `~/.env` or the dashboard): `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_WORKSPACE_USER`, `CRON_SECRET`, `CALENDAR_FEED_TOKEN`, `TURNSTILE_SECRET`, `CF_ANALYTICS_EMAIL`, `CF_ANALYTICS_KEY`, `STRIPE keys`.
- Vars (`wrangler.toml [vars]`): `MAIL_FROM=National Closet Company <hello@nationalclosetco.com>`, `MAIL_DEFAULT_REPLY=hello@nationalclosetco.com`, `STAFF_EMAIL=hello@nationalclosetco.com`, `ALERT_FROM_USER=crm@nationalclosetco.com`, `QUOTE_MARKUP_RATE=0`.
- `/crm/traffic` dashboard — password `NCC_CRM_PASSWORD` in `~/.env` (bespoke (crm/traffic.html, /api/traffic, /api/traffic-channels?view=humans|all&tn=1, functions/api/traffic-rankings.js)).
- `/crm` — login `NCC_CRM_PASSWORD` in `~/.env`; admin hello@nationalclosetco.com; ~60 endpoints in functions/; funnel pages book/ estimate/ proposal/ contract/ portal/ thanks/; change password with node crm/setup-admin.mjs <email> [pw]
- Google: GA4 `G-EJEDXZZWJN` (property 539664920); Search Console `sc-domain:nationalclosetco.com`; Ads customer `8968122786` / `AW-18306256681`; Business Profile `ChIJhxwNszEGaqwRqWPjnfc_iUE`. GA4 property lives under the Elopements Inc account (readable with the NWD OAuth token); Ads account is NOT under the Elopements manager — login-customer-id 8968122786; conversion labels: form UnZvCNvcxMwcEKmejZlE, click-to-call rm_UCOCV2_AcEKmejZlE, calls-from-ads 7752567517; key events booked_consultation/generate_lead/contact; MP secret NCC_GA4_MP_SECRET
- Meta pixel `904015652453670`. Lead event fires on a real form save; the July–Aug 2026 paid campaign (83% of sessions, zero leads) has ended
- Zone `1d51a379abcf889e1f8a5445f6ed9b93` (Cloudflare DNS; Google Workspace MX/SPF/DKIM/DMARC p=reject). Canonical = apex, www 301s.
- D1 `nationalcloset-crm` (id `f5787ce4-29f9-43be-bf0e-cb486f1ec8e9`) bound as `DB`, prod + preview; migrations in `crm/migrations/` (0054 pageviews, 0066 GA ids on leads, 0067 review_request_visit, 0068/0069 template wording) applied with `d1 execute --file`. R2 `nationalcloset-files`.
- Non-secret config is in `wrangler.toml [vars]` because `wrangler pages deploy` wipes dashboard vars.
- Edge analytics secrets `CF_ANALYTICS_EMAIL/KEY`; `email_sync_state` needs its INBOX seed row.

## Forms, mail, tracking
- `/api/contact` (name + phone) → D1 `leads` (email may be "" until `/api/contact-address` or the booking supplies it; a contact row is created then) → welcome mail via `_lib/lead-ack.js`; every CTA → `/book/` (slots from `/api/public/slots`, `lead_token` from sessionStorage `ncc_lead`); "Text a photo" sms: link in the mobile bar.
- Tracking: GA4 `G-EJEDXZZWJN` (property 539664920 — no other tag in the code), Ads `AW-18306256681` (form label `UnZvCNvcxMwcEKmejZlE`, click-to-call `rm_UCOCV2_AcEKmejZlE`), Meta pixel `904015652453670`. CSP includes bare `analytics.google.com`, `ad.doubleclick.net`, `stats.g.doubleclick.net`, Turnstile.
- Judge performance on the humans/Tennessee view (`?view=humans&tn=1`) and leads per in-market visit; `pageviews` blog entries without a `page_engagement` beacon are bots.

## Gotchas
- **`index.html` carries its own inline copy of the stylesheet** (`<style id="ncc-inline-css">`) — a fix to `css/styles.css` skips the homepage unless re-synced with `stage4.py sync_inline_css()`, which also keeps the Montserrat `@font-face` lines the block needs. Never paste `styles.css` over it by hand. Classes that exist only in the inline block render unstyled elsewhere.
- "200 means received, `success:true` means saved" — the client once fired GA4/Ads/Meta on bot drops.
- Never reintroduce Klarna or monthly-financing copy (three payments: 50% signing, 25% at materials/scheduling, 25% install day); never re-add SMS; cabinets are priced per project — no ranges without the owner’s numbers.
- Landing-page anchors belong on the form wrapper with `scroll-margin-top: calc(var(--nav-h) + 1rem)`; `.lp-hero` needs `padding-top` like `.hero` because `.nav` is fixed.
- Google refuses `UploadClickConversions` for new integrations and `CREATION_NOT_SUPPORTED` for GA4-custom actions via API; auto-apply once undid the bid cap.
- The GA4 "0 since Jul 17" cliff was account-side + the owner’s ad blocker; Cloudflare edge = true traffic, CRM = true conversions.

## Open items
- Client still owes: a portrait of Michael, a crew photo, a 60–90 s install/3D-walkthrough video.
- Google Postmaster Tools TXT on the zone.
- Stripe Dashboard: turn off Klarna as a payment method on invoices (owner).
- Enhanced conversions (hashed email/phone) not wired — optional.
