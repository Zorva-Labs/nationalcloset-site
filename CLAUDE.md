# National Closet Company — operating manual

nationalclosetco.com · Cloudflare Pages `nationalcloset` · github.com/Zorva-Labs/nationalcloset-site · `~/nationalcloset-site` · status: **live**

**Before changing anything:** read the top of `CHANGELOG.md`, and the `docs/` file for the part you change. **After:** append an entry there; if infrastructure changed (a secret, a database, a domain, an account id), update `site.json` and this file too. This file says how the site works; the history is in `CHANGELOG.md`. The rules that apply to every site are in `~/.claude/CLAUDE.md`; estate-wide facts (accounts, conventions, gotchas) are in `~/fleet/docs`.

## What this is
Marketing site + full CRM for National Closet Company: custom closets, pantries, garage storage and custom cabinets in Nashville and Middle Tennessee; a division of Blair Custom Interiors, owners Michael and Noah Blair. ~70 pages: home (hero "ballpark" estimator, before/after slider, real Google reviews, price tiles, family strip, gallery teaser, projects, FAQs), `/gallery`, `/our-work`, `/about`, `/reviews`, `/faq`, `/custom-cabinets-nashville`, `/custom-pantry-nashville`, 19 city pages, 8 competitor "alternative" pages, pricing guide, warranty, service areas, "Closet Cases" blog, `/free-design` (noindex paid landing page), `/book` (self-booking), `/review` (302 to the Google review link). CRM at `/crm` with proposals, contracts, invoices (Stripe), scheduling, email sync, review requests, a team roster with per-consult/per-job assignment, and a traffic dashboard; the customer's side is the token pages `estimate/`, `proposal/`, `contract/`, `invoice/`.

## Rules for every change
- **Standing calls:** no Klarna or monthly-financing copy (three payments: 50% at signing, 25% at materials/scheduling, 25% on install day); no SMS from the CRM (the owner declined Twilio); **never re-add Murphy beds or wall beds** (Michael); cabinets are priced per project, no ranges without the owner's numbers (`docs/content.md`).
- **Google Ads is stopped:** campaign 24052252978 is paused and BCI advertises closets and pantries. Never re-enable it without splitting the terms with BCI first (`docs/google-ads.md`).
- **Real work is never generated.** Every generated picture is an entry in `tools/images/manifest.js`; the photos of real jobs, the before/afters and the 3D renders stay out of it. Alt text comes from the manifest: `apply-alt.mjs` undoes a hand edit (`docs/design.md`).
- **Build pages with the page factory** (`tools/site-build/`) so the chrome stays identical. `index.html` carries its own inline copy of the stylesheet: after a change to `css/styles.css`, re-sync it with `stage4.py sync_inline_css()`, never by pasting (`docs/design.md`).
- **One service vocabulary in two places:** the public form's picker in `js/main.js` and `SERVICES` in `crm/crm-app.js` must match (`docs/content.md`).
- **200 means received, `success:true` means saved:** GA4, Ads and Meta fire on `success:true` only (`docs/tracking.md`).
- **The CRM:** re-measure at 375px after adding a page, and as painted at 1280px and 375px after adding a color; never put text on `--accent`. Templates → Email edits the plain text and the HTML; the consult brief's wording and its fallback stay byte-identical (`docs/crm.md`, `docs/automations.md`).
- **A preview deployment shares the live D1:** a form or CRM action there is real (`docs/tracking.md`).
- **Central time comes from `functions/_lib/dates.js`** (`centralNow()`, `todayCentral()`, `centralAt()`, `centralMidnightUtc()`, the IANA zone), never a flat offset. The DB stores naive Central wall-clock strings, and Central is UTC-6 from November to March (`docs/automations.md`).
- **A new page or post goes into `sitemap.xml` the day it goes live:** `site-kit submit` sends only what the sitemap lists (`docs/content.md`).

## The reference — read the one for the part you change
- `docs/content.md` — the pages, the page factory, the payment terms and services, the service vocabulary.
- `docs/design.md` — the look, the header, the components, the home page's inline stylesheet, the landing page, the generated pictures and their alt text.
- `docs/crm.md` — `/crm`: sign-in, the pipeline and the contracts, invoices and Stripe, the customer's pages, the team, the UI on a phone and its contrast, mail templates and times, the D1 and its migrations.
- `docs/automations.md` — mail, the cron Worker and what each sweep does: install day, the customer's reminder, the consult brief, review requests, proposal expiry, the inbound sync.
- `docs/tracking.md` — the lead forms, GA4, the Ads tag and the Meta pixel, the CSP, the local preview.
- `docs/traffic.md` — `/crm/traffic`: what the edge logs and drops, the views, the panels and where each gets its figures.
- `docs/google-ads.md` — the stopped campaign as it ran, the conversions, the daily launchd job and its scripts, what Google refuses.

## Build & deploy
```bash
set -a; . ~/.env; set +a; unset CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL   # the account token CLOUDFLARE_API_TOKEN (since 2026-09-23); credentials live in ~/.env, never in the repo
git fetch origin && git rev-list --count HEAD..origin/main   # must print 0 before any build or deploy
node build.mjs   # dist/ = the allow-list of public files; ends with site-kit lastmod (the sitemap's real dates)
npx wrangler pages deploy dist --project-name=nationalcloset --branch=main --commit-dirty=true
node ~/site-kit/bin/site-kit.mjs submit   # IndexNow + Search Console + Bing, once the real domain serves the deploy; commit .indexnow.json after
```
- Pages are built/synced by tools/site-build/stage4.py (chrome sweep + page builds) — run it, review, then `node build.mjs` and deploy. There is no check command (`site.json → build.check` is null).
- **Deploy `dist/`, never the repo root** — a root deploy publishes the repo (`CLAUDE.md`, `CHANGELOG.md`, `docs/`, `site.json`, `wrangler.toml`, `.indexnow.json`, `migrations/`, `.claude/`); Pages never reads `.assetsignore` (`~/fleet/docs/gotchas.md`). `build.mjs` copies an allow-list — every root `.html` page, the named files, the folders in `DIRS`, the IndexNow key — and inside the folders nothing for the repo (`.md`, `.sql`, `.py`, dotfiles, `migrations/`), so `docs/` never deploys. It names any file a page links to that it did not copy; a new public file at the root goes on its list. It ends with `site-kit lastmod`, so `dist/sitemap.xml` carries each page's real last change (the root `sitemap.xml` carries no dates). Functions still ship: wrangler reads `./functions` and `wrangler.toml` from the repo root whatever it uploads. `crm/` ships its pages and scripts but never `schema.sql`, `setup-admin.mjs` or `migrations/`; `tools/` and `scripts/` stay home. The middleware also 404s repo paths (`REPO_INTERNAL`).
- Or `node ~/fleet/bin/fleet.mjs deploy nationalcloset`, which runs build → deploy from `site.json` and refuses a checkout that is behind origin.
- Pages binds secrets at deploy time — after any `wrangler pages secret put`, deploy again.
- The daily Ads job runs `git pull --ff-only` in this checkout at 07:15 CT (`docs/google-ads.md`).

## Map
- Root `*.html` and `blog/` the pages · `css/styles.css`, `js/main.js` · `img/`, `fonts/` · `_headers` (the CSP) · `llms.txt`, `robots.txt`, `sitemap.xml` · `calc.html` the internal payment calculator (noindex).
- `book/`, `estimate/`, `proposal/`, `contract/`, `invoice/`, `thanks/` the customer's pages · `crm/` the CRM's pages and scripts, `schema.sql`, `setup-admin.mjs`, `migrations/`.
- `functions/` — `_middleware.js` (the US gate, the edge log, repo paths, `/review`, the `*.pages.dev` noindex), `api/` (84 endpoints: the CRM's, `contact.js`, `public/*`, `internal/*` for the cron, `stripe/webhook.js`, `traffic*.js`), `functions/_lib/` (mail, lifecycle, invoices, team, the brief, review requests, Stripe, spam checks).
- `tools/images/` the generated pictures · `tools/site-build/` the page factory · `tools/review-card/` the printed review card · `scripts/` the Google Ads scripts · `.claude/launch.json` the local preview.

## Infrastructure & accounts
- Cloudflare Pages project `nationalcloset` → nationalcloset.pages.dev (noindexed by the middleware); domain nationalclosetco.com. Zone `1d51a379abcf889e1f8a5445f6ed9b93` (Cloudflare DNS; Google Workspace MX/SPF/DKIM/DMARC p=reject). Canonical = apex, www 301s.
- D1 `nationalcloset-crm` (id `f5787ce4-29f9-43be-bf0e-cb486f1ec8e9`) bound as `DB`, prod + preview; migrations in `crm/migrations/` (`docs/crm.md`). R2 `nationalcloset-files` as `FILES` (proposal drawings and other uploads), prod + preview.
- Workers: `nationalcloset-email-cron` (`~/nationalcloset-cron`, every 3 minutes; `docs/automations.md`). launchd `com.zorvalabs.ncc-ads-conversions`, daily (`docs/google-ads.md`).
- Secrets (names only — values in `~/.env` or the dashboard): `GOOGLE_SA_EMAIL`, `GOOGLE_SA_PRIVATE_KEY`, `GOOGLE_WORKSPACE_USER`, `CRON_SECRET` (= `NCC_CRON_SECRET`), `CALENDAR_FEED_TOKEN`, `TURNSTILE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (`NCC_STRIPE_*` in `~/.env`), `CF_ANALYTICS_TOKEN` (the edge panel).
- Vars (`wrangler.toml [vars]`, because `wrangler pages deploy` wipes dashboard vars): `MAIL_FROM=National Closet Company <hello@nationalclosetco.com>`, `MAIL_DEFAULT_REPLY=hello@nationalclosetco.com`, `STAFF_EMAIL=hello@nationalclosetco.com`, `ALERT_FROM_USER=crm@nationalclosetco.com`, `QUOTE_MARKUP_RATE=0`, `STRIPE_PUBLISHABLE_KEY` (public), and `PURELYMAIL_USER`, `IMAP_HOST`, `IMAP_PORT`, which nothing reads.
- `/crm` and `/crm/traffic` — login `NCC_CRM_PASSWORD` in `~/.env`; admin hello@nationalclosetco.com; change a password with `node crm/setup-admin.mjs <email> [pw]`.
- Google: GA4 `G-EJEDXZZWJN` (property 539664920) under the Elopements Inc account (readable with the NWD OAuth token); Search Console `sc-domain:nationalclosetco.com`; Business Profile `ChIJhxwNszEGaqwRqWPjnfc_iUE`; Ads customer `8968122786` / `AW-18306256681`, NOT under the Elopements manager — login-customer-id 8968122786; conversion labels: form `UnZvCNvcxMwcEKmejZlE`, click-to-call `rm_UCOCV2_AcEKmejZlE`, calls-from-ads 7752567517; key events booked_consultation/generate_lead/contact; MP secret NCC_GA4_MP_SECRET.
- Meta pixel `904015652453670`: the Lead event fires on a real form save; the July–Aug 2026 paid campaign (83% of sessions, zero leads) has ended.

## Open items
- `NCC_CRM_PASSWORD` in `~/.env` no longer logs in (401 as of 2026-09-22) — ask Michael for the current one, or reset with `node crm/setup-admin.mjs hello@nationalclosetco.com <pw>`.
- Client still owes: a portrait of Michael, a crew photo, a 60–90 s install/3D-walkthrough video.
- The gallery captions `blog-large-walkin.webp` and `blog-3d-design-result.webp` "Real project", but they are generated: replace them with photos of those installs, or change the captions (`CHANGELOG.md`, 2026-09-22).
- Google Postmaster Tools TXT on the zone.
- Stripe Dashboard: turn off Klarna as a payment method on invoices (owner). Still on, 2026-09-25.
- `com.zorvalabs.ncc-ads-conversions` still runs: unload it once the last ad clicks are past the conversion window, if Michael confirms the stop is permanent.
- Only if the ads run again, and optional: switch on Enhanced Conversions for "Submit lead form" in the Ads UI. The tag already sends `user_data`, and the account has accepted the customer data terms.
