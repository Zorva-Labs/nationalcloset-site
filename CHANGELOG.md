# Changelog — National Closet Company

Newest first. One entry per session that changed this repo: what changed, why, what the client asked for, what is still owed. Infrastructure changes also go in `site.json` and `CLAUDE.md`. Entries dated before 2026-09-17 are reconstructed from git history; the reasoning behind them is in `CLAUDE.md` and in `~/fleet/docs/archive`.

## 2026-09-25 (CSP: the rest of Google's hosts for the Ads tag)
- Michael: add what the CSP was missing from Google's list for the Ads tag. This came out of a check of the Ads CSP on every site that runs Google Ads. The tag (`AW-18306256681`, loaded by `js/main.js` on every page) still runs, although the ads stopped on 9/22.
- `_headers` (the `/*` policy), from Google's CSP guide for the Google tag (developers.google.com/tag-platform/security/guides/csp): `https://www.google.com` added to `script-src`, `https://pagead2.googlesyndication.com` to `connect-src` and `https://www.googletagmanager.com` to `frame-src`. Nothing else in the policy changed.
- Nothing was being blocked. The check ran `/free-design` under the live policy and every Ads hit went through. Google lists these three hosts for the Ads tag but the tag didn't request them, so they are added in advance.
- Checked locally before deploying. `dist/` was served with its `_headers`, with GA4 hits dropped and the Meta pixel stubbed, so nothing reached the site's accounts. The home page had no CSP violations and every Ads hit went through. Built (`node build.mjs`; this site has no check command), deployed (`e27c1ef9`), submitted (nothing changed). The live header has all three.
- **Owed:** nothing.

## 2026-09-24 (Turnstile: a wrong secret no longer drops the lead)
- `functions/_lib/spam.js` → `turnstileReason`: only a rejected token (`invalid-input-response`) counts as a bot now. Every other siteverify failure (`invalid-input-secret`, `missing-input-secret`, `bad-request`, `internal-error`, or no code at all) fails open and is logged as `[turnstile] siteverify error, not counted as a bot (check TURNSTILE_SECRET)`. Until today each of those dropped the lead silently with `{ok:true}`: no row, no email. So a mistyped or rotated `TURNSTILE_SECRET` would have lost every visitor who got a token, and a test without a token (the browser pane's) could never show it. `timeout-or-duplicate` still fails open; the honeypot and the time-trap are unchanged.
- This site has `TURNSTILE_SECRET` set, so the fix protects its forms today. This `spam.js` carries its own comments, so the same logic as the model's (`~/nittanytax-site`) went in under them (`~/fleet/docs/gotchas.md` → Forms and leads).
- Tested: 14 cases against a mocked siteverify, the old function beside the new, and the new one against the real siteverify (a valid secret with a dummy token is still rejected as a bot; a bogus secret fails open and logs `invalid-input-secret`). Built, no check in `site.json`, deployed (`c3cd9ce5`), submitted (nothing changed for IndexNow or Search Console; Bing has the sitemap).
- Why: Michael's call, 2026-09-24 — a lead form never silently drops a submission, and a wrong secret was a way this one could. Not a client request.
- **Owed:** nothing.

## 2026-09-24 (/traffic: a Chrome prefetch is not Google's ad review)
- Michael: roll out to every dashboard the fix first made on Blair Custom Interiors, where a lead from a Google ad came out "Unknown". Chrome fetches Google's results and ads before the click through Google's own proxy, so the fetch comes from Google's network with the ad's gclid on it. This morning's ad-review rule filed those fetches as "Google ad review", which gets no source cookie. An opened one was never counted as a visit, and its call or form lost where it came from.
- **By hand** (this middleware skips bots before logging and has no source cookie, so `add-ad-review.mjs` cannot patch it): the `// ad-review:` block was refreshed from the template, so a prefetch is never ad review. A prefetch is also not logged (`&& !isPrefetch(request)` on the `logPageview` call), but it stays behind the country gate. There is no `pv-view.js` here: the default traffic view is `page_engagement`, written by `js/main.js`'s own beacon, which already counts an opened prefetch. `pageviews` also has no bot or device columns.
- Deployed (`a73f830b`). Live test: a request with `Sec-Purpose: prefetch` was not logged, while an ordinary one was (the control row, 14133, was deleted).
- No Google ads run here since 2026-09-22, and bots are never logged, so there was nothing to correct.
- **Owed:** nothing.

## 2026-09-24 (/traffic section 4: what Bing holds now)
- Michael: add four things from Bing to the traffic page on every dashboard: which of the site's pages Bing has found and when it last read each, the pages it couldn't read, pages in its index over time, and the sitemap's status. `add-bing.mjs --apply` (traffic-kit `cf8ef48`) refreshed section 4 and the page (the endpoint is ported by hand). The figures come from gsc-ingest's nightly Bing pull (`66f863c`). "What Bing has read" and the two new panels show even while Bing has no search figures.
- What Bing holds for nationalclosetco.com today: two sitemaps: `/sitemap.xml` read 24 Sept, 63 pages, no errors; `www.nationalclosetco.com/sitemap.xml` read 23 Sept, 63 pages, no errors; no problem pages; its pages are asked about over the next nights. This evening's catch-up stopped before reaching it, when Bing throttled the account's page lookups.
- The CRM page's block was refreshed with `add-bing --no-endpoint` (its section points at `/api/traffic` and `/api/traffic-bing`). The endpoint `functions/api/traffic-bing.js` is the template's, ported by hand as before: the header, `requireAuth` from `../_lib/auth.js`, and `context.env.DB`, since `/api` here has no directory middleware.
- The page names the www sitemap with its host, so its two sitemap lines don't read the same.
- Built, deployed (`4a5aa8f1`), submitted (nothing new to send).
- **Owed:** nothing. The nightly pull keeps asking Bing about the site's pages: never asked first, then pages it hasn't found every three days, and the rest every ten.

## 2026-09-24 (ad-review visits)
- **Google's own ad-review visits are no longer counted as visitors.** Google loads ad landing pages from its own network with an ordinary browser user agent and a gclid, so this site's edge log counted each one as a person arriving from an ad. On Blair Custom Interiors, where it was found, that was 18 of the first 40 ad visits. `functions/_middleware.js` now carries traffic-kit's `adReviewBot()` block (the template's code, placed by hand because this middleware predates the kit). A request from Google's networks (AS15169, AS396982) with a click id is treated like the crawlers already are: served, never geo-blocked, and not logged. It matches by network number, so Google Fiber customers still count.
- No backfill here. `pageviews` stores neither the ISP nor the network, so the earlier review visits cannot be told apart from people. National Closet stopped advertising on 2026-09-22, so few were logged.
- Built, deployed, submitted (nothing changed).

## 2026-09-24
- **Edge panel restored.** The /traffic edge panel (Cloudflare zone analytics over GraphQL) now authenticates with `CF_ANALYTICS_TOKEN` — the read-only account token "Traffic-API" (Zone Analytics: Read), `CF_ANALYTICS_TOKEN` in `~/.env` — and falls back to the old `CF_ANALYTICS_EMAIL` + `CF_ANALYTICS_KEY` pair, which held the global API key that stopped authenticating estate-wide on 2026-09-23 (traffic-kit, same change in every copy). This site's panel had been failing since 2026-09-23; the secret `CF_ANALYTICS_TOKEN` is set on the Pages project and this deploy binds it.

## 2026-09-23 (nationalcloset.pages.dev noindex — deploy pending)
- **`nationalcloset.pages.dev` gets noindex.** Found in the estate sweep that followed a Search Console notice about harmonytax.pages.dev: this site's preview host answered 200 with `index, follow` and no header — an indexable copy of nationalclosetco.com, held back only by the canonical tag. `functions/_middleware.js` now sets `x-robots-tag: noindex, nofollow` on every response whose host ends in `.pages.dev` (deployment aliases included) — the exported handler now wraps the old one, so every return path (bypass paths, crawlers, allowed visitors, the geo-block page, the repo-file 404, the /review redirect) leaves with it — and never on nationalclosetco.com. Checked first that nationalclosetco.com (apex and www) serves the site itself and does not redirect to the pages.dev host, and that the pages.dev canonical points at nationalclosetco.com. Tested with a fake context (on pages.dev the page, a stylesheet, a 404 and a deployment alias carry the header; on nationalclosetco.com nothing does); built.
- **Not deployed yet.** The Cloudflare Global API Key in `~/.env` stopped authenticating at 22:10 UTC — a change of the Cloudflare account's email was requested at 22:09 — so `wrangler pages deploy` answered `Unknown X-Auth-Key or X-Auth-Email`. Owed: run `site.json → deploy.command` once `~/.env` works, then check `curl -sI https://nationalcloset.pages.dev/` shows the header and `https://nationalclosetco.com/` does not. `fleet audit` fails this site until then.

## 2026-09-23 (build check, icons)
- `build.mjs`'s link check no longer reports an encoded fragment (`%23…`, from an inline SVG data URI) as a missing file, so a build that warns is a build with a real broken link.
- **The customer estimate page and `/thanks/` render as designed again** (Michael: "fix all with your best recommendations"). Both linked `/styles.css` and `/assets/images/…`, which were never in this repo (404 since at least 2026-08-01), so they lost the design tokens their inline styles use (`--color-*`, `--font-*`): the estimate a customer opens from the CRM's email (`/estimate/?t=…`) rendered in a default serif on white. Each now carries NCC's tokens inline, as `/contract/` does, loads Montserrat and uses `/img/favicon-ncc.png`; the estimate gains the base body rules (cream ground, ink text, Montserrat) the missing sheet used to give. Its letterhead also said "Blinds, Shutters & Shades" — not this business — and now reads "Custom Closets & Closet Systems", as the contract and proposal do. Checked in the browser pane: `/thanks/` as designed, and the estimate rendered with sample figures (the page's own template, nothing saved). Deployed.

## 2026-09-23 (stop publishing the repo)
- **The site no longer publishes its internal files.** It was deployed from the repo root (`wrangler pages deploy .`), and Pages uploads everything there except `functions/`, `node_modules` and `.git` — the `.assetsignore` meant to prevent that is a Workers static-assets file Pages never reads. So `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json` (client contact details), `/wrangler.toml`, `/.indexnow.json`, `/.gitignore`, `/.claude/launch.json` and every `/migrations/*.sql` answered 200. Also `tools/` and `scripts/`. The CRM's `schema.sql`, `setup-admin.mjs` and its 70 migrations, and `wrangler.toml`, were already refused by the middleware's guard, which only missed the manual, changelog, manifest and state files; the guard now covers those too, and `build.mjs` keeps all of them out of the upload. New `build.mjs` copies an allow-list into `dist/` — every root `.html` page (404 and `/traffic` included), the named files and folders, the IndexNow key; inside the folders nothing for the repo (`.md`, `.sql`, `.py`, `.sh`, `.log`, `.toml`, dotfiles, `migrations/`) — names any file a page links to that it did not copy, and ends with `site-kit lastmod` (the sitemap's real dates now go into `dist/sitemap.xml`; the root `sitemap.xml` carries none). `site.json → deploy.command` is `npx wrangler pages deploy dist …`; `site.json → build` is `node build.mjs` → `dist`; `wrangler.toml` `pages_build_output_dir = "dist"`; `.assetsignore` removed. Functions ship as before (wrangler reads `./functions` from the repo root).
- **The middleware refuses repo files** (`isRepoFile` → the site's own 404, `no-store`), whatever a deploy uploads. It was needed at once: after the first `dist/` deploy the domain still answered 200 for the exact URLs fetched during the before-check — copies held by Pages' edge (`s-maxage=604800`, a growing `age`, `cf-cache-status: DYNAMIC`; a zone purge did not reach them) while any other path, or the same one with a query string, was already 404. The middleware answers before that cache, so they went 404 on the next deploy.
- Checked: of the 395 files the root deploy published, the 271 in `dist/` are exactly the public ones, byte for byte — everything dropped is internal. A preview deployment (`--branch=allowlist-check`) served every `dist/` file and none of the internal ones, in the browser pane the pages rendered and the forms were intact (not submitted — a test would reach the client), and `/traffic` rendered its sign-in with the API answering as a function. After the production deploy the live domain serves every public file (200), `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json`, `/wrangler.toml` and `/.indexnow.json` answer 404, `/traffic` shows its sign-in and `/api/traffic/data` answers 401 without a session (this site's dashboard is `/crm/traffic`, unchanged).

## 2026-09-23 (real sitemap dates)
- **Every sitemap date is now the day that page last changed** (Michael: "Switch [sitemaps] to real change dates"). `site.json → deploy.command` and the manual's deploy block start with `node ~/site-kit/bin/site-kit.mjs lastmod`: each `<lastmod>` is the day the page's own content last changed (the words, links and structured data of the page itself — not the header or footer), read from `.indexnow.json`, where `submit` records the day a page's content changes. A changed page gets that day; an unchanged one keeps its date. Google trusts lastmod only from sites whose dates prove accurate, and Bing leans on it.
- Dates seeded once from git history (`site-kit lastmod --history`): 2026-09-22 (38), 2026-09-17 (25). The old sitemap carried hand-set dates (2026-09-17, 2026-09-10, 2026-08-02, 2026-08-01, …). Deployed; the sitemap resubmitted to Search Console (`submit --resubmit`). The step rewrites `sitemap.xml` — commit it with each deploy, as `.indexnow.json`.

## 2026-09-23 (submit on every deploy)
- **Every deploy now submits to IndexNow, Google Search Console and Bing** (Michael: "when a site is created or updated it needs to be submitted to indexnow, google search console and bing"). An IndexNow key file at the site root (a 32-hex `.txt`; not a secret — it can only submit this site's URLs), and `site.json → deploy.command` plus the manual's deploy block end with `node ~/site-kit/bin/site-kit.mjs submit`: IndexNow for the pages that changed, the sitemap resubmitted to Search Console when anything changed, the sitemap to Bing when Bing lacks it — only once the real domain serves the deploy; state in `.indexnow.json` (commit it with each deploy). Deployed: IndexNow's first submission sent all 63 URL(s) (202), Search Console took the sitemap; Bing's daily sitemap cap was used up tonight, so its sitemap goes to Bing tomorrow (`node ~/fleet/bin/bing.mjs sitemaps --apply`); IndexNow already carries every change to Bing.
- Found while doing this, not changed here: this site is deployed from the repo root, so `/CLAUDE.md`, `/CHANGELOG.md`, `/site.json` and `/wrangler.toml` are served publicly (`.assetsignore` does nothing for Pages) — flagged as its own task (an allow-list build into `dist/`).

## 2026-09-22 (Bing on /crm/traffic)
- **The traffic page has a fourth section, Bing Webmaster Tools** (Michael: add Bing's report info to the traffic page on all sites). `functions/api/traffic-bing.js` is traffic-kit's `/api/traffic/bing` behind this CRM's own `requireAuth` (here `/api` has no directory middleware); `crm/traffic.html` gained the nav link, the section inside the page's template string after `<!-- /src-ga -->` (`data-watch="/api/traffic"`, `data-api="/api/traffic-bing"`), and traffic-kit's self-contained script ahead of the page's own inline script — it follows the page's `/api/traffic?…` request and asks for Bing's last 30 days (the page's Today view included). Checked in the browser pane against fixtures: the section renders in this CRM's styles (plain tiles, as this page has no `window.chart`), both inline scripts parse. The numbers come from gsc-ingest's daily Bing push (09:40 UTC); nationalclosetco.com is in Bing since today, so the section reads "connected, nothing yet" until Bing's first data lands. Deployed; `/api/traffic-bing` answers 401 without a session.

## 2026-09-22 (night)
- **Google Ads stopped** (Michael: "NCC will no longer be advertising"). Campaign 24052252978 "NCC Search Campaign" paused through the API. Closets, pantries, garage and laundry are now advertised from Blair Custom Interiors' account (390-380-7644, landing pages on blaircustominteriors.com/free-design/) — the two are affiliated and must never bid on the same terms at once. The daily launchd job `com.zorvalabs.ncc-ads-conversions` is left running: it still uploads booked consultations for past ad clicks, and its guard only pauses things, so it cannot restart the campaign. Unload it once the last clicks are past the conversion window if Michael confirms the stop is permanent.

## 2026-09-22 (evening)
- **Crew can be assigned where consults are actually booked, and the brief no longer says "Today" for a Friday visit.** Michael: there was no way to assign a crew member to Brad Lay's consult, and the brief he sent said "Today 11:00 AM" though the visit is Friday the 25th.
  - **Assigning:** the consult had been booked from the lead page's **Book consultation** form, which had no crew picker (only the calendar's Edit form and quick-add did), so nobody was assigned and the brief went to the whole team. That form now has the "Who's going" picker, and the calendar's consult view has an **Assign / Change** button beside "Going" that saves the crew without opening Edit.
  - **The day:** the wording was hard-coded "Today" / "Morning" — right for the 7am sweep, wrong for **Send crew brief** pressed days early. The brief now takes `{{day_word}}` (Today / Tomorrow / Friday / Friday, October 2), `{{day_relative}}` (today / tomorrow / on Friday) and `{{greeting}}` (Morning / Afternoon / Evening by the Central clock) in the subject, the heading and the first line. Migration `0071_consult_brief_day_words.sql` rewrote only those phrases in the live `consult_brief` template (applied remotely); `FALLBACK` in `_lib/consult-brief.js` matches it; the Templates page lists the new tokens.
  - **Still owed:** Brad Lay's consult (appointment 41, Fri 25 Sep 11:00) has nobody assigned — pick the crew in the calendar and the 7am brief on Friday will go to them only. Not clicked through in the browser pane: the CRM password in `~/.env` still 401s.

## 2026-09-22 (later still)
- **Murphy beds and wall beds are off the site.** Michael: drop the service. Every mention is gone — the word does not appear anywhere in the repo any more.
  - **Removed:** the home page service tile (and its picture, `img/svc-murphy.webp`, plus its entry in the image manifest); the "Murphy & Wall Beds" link in the footer services column on all 72 pages; the "Wall Beds & Murphy Beds" bullet in the service list on all 19 city pages; the two home page marquee items; the `Wall Beds & Murphy Beds` Offer in the Service schema (home page and the `head.html` source); the `Murphy Beds / Wall Beds` line and the FAQ answer in `llms.txt`; the "Murphy / Wall Bed" option in the site's lead-form space picker (`js/main.js`) and in the CRM's service vocabulary (`crm/crm-app.js`).
  - **Reworded** rather than deleted, so the sentences still read: three FAQ answers (visible copy **and** the FAQPage schema, on `/faq`, the home page, `/about` and the competitor pages), two schema/meta descriptions, and the service list on the competitor pages.
  - **The truck photo alt** on `/service-areas` used to transcribe the whole wrap, wall beds included. It now describes the truck without the service list. **The wrap on the actual truck still says "Well Beds & Murphy Beds"** — which is also a typo for "Wall" — so that is a physical item for the owner to decide about.
  - **CRM records are unaffected.** The CRM's service field is a `<datalist>`, not a `<select>`, so removing the option only removes the suggestion; a query of the live D1 found **no lead or project** referencing a Murphy or wall bed, so nothing historical loses its label.
  - **One layout fix came with it.** The services grid paints its own hairline borders, so dropping a tile left 8 in a 3-column grid and the empty cell rendered as a 393px grey block. `.svc-grid > .svc:last-child:nth-child(3n + 2)` now spans the last tile across the rest of its row, with the image at `32/10` instead of `16/10` so the row keeps its height. Re-synced into the home page's inline stylesheet with `stage4.py sync_inline_css()` — the diff was the new rule and nothing else.
  - Checked after the edits: 217 JSON-LD blocks across 72 pages all still parse (entries were removed from inside JSON, so this was the thing most likely to break), no page has a dangling image reference, all 375 content images still have alt text, `js/main.js`, `crm/crm-app.js` and the build scripts all parse, and the home page, `/faq` and a city page were read at 1280px, 800px and 375px with no horizontal overflow and no mention of the service in the rendered text.

## 2026-09-22 (later)
- **Every look image on the site is new.** Michael: the hero and the inspiration shots needed to be nicer — walk-in closets, cabinets, built-ins and pantries — with **no islands, no windows, no flat slab doors or drawer fronts, no glass doors or shelving, no carpet, proper handles and pulls, and a mix of white, dark wood and light wood**. 63 pictures were made to that brief and dropped in at the same paths and the same dimensions, so no layout moved.
  - **What changed:** the home page hero (`hero-closet` + its 480/800/OG sizes), all 34 `insp-*` inspiration shots (walk-in, reach-in, pantry, garage, laundry), all 9 `svc-*` service tiles, all 11 `cab-*` cabinet shots on `/custom-cabinets-nashville`, and the 8 photographic blog headers. Every OG card that crops one of those was rebuilt from the new source.
  - **What was deliberately left alone:** the real work — the Fraleys' closet and pantry, Keith & Irena's office wall, the `pantry-before/after` slider, `blog-closet-organization-before/after` — the 3D design renders, the wall-mounted vs floor-based comparison diagrams, the branded blog title cards, the truck and the logos. Generated pictures set the mood; they never stand as proof of a job.
  - **Two files were renamed** because their names described something that is no longer in the picture: `feat-island.webp` was never an island (its alt always said "reach-in closet") and is now `insp-reachin-9.webp`; `cab-island.webp` is now `cab-kitchen-run.webp` and shows a full walnut kitchen run with a coffee bar and tall pantry cabinets instead of an island. The "Kitchen cabinets & islands" card keeps its title and copy — islands are still a service, the picture just leads with the cabinet run.
  - **Alt text was rewritten for all 162 `<img>` tags** that point at a new picture, because the old text described white melamine and carpet that is no longer there. One accurate description per image, wherever that image appears. Two captions that named an island were corrected: the gallery tile and the cabinets-page hero caption (now "a paneled range hood").
  - **The prompts are committed**, in `tools/images/` — `rules.js` (the eight rules every picture obeys), `manifest.js` (one entry per image: subject, aspect, output size, alt), `generate.mjs` (Venice, reads the balance first and stops on the first 402, concurrency 5) and `convert.mjs` (PNG → the exact WebP and OG sizes the site serves). Re-running `generate.mjs` only makes what is missing, so a single picture can be redone by name.
  - Made with Venice: `flux-2-max` for the first pass after a four-model bake-off, `nano-banana-pro` for the ten that needed a second take — nine that came back weak (an empty walk-in, a pantry with fake brand names legible on the packaging, a vanity where a mirror swallowed the cabinetry, a "floor-based" shot that did not show a toe kick, a "rail" shot with nothing hanging in it) plus the new kitchen run. About $8.30 in all.
  - Checked as delivered: no page has a dangling image reference, nothing 404s, every content image has alt text (only the Meta pixel beacons have none, correctly), and the home page, gallery and cabinets page were read at 1280px and 375px in the browser.
- Still owed: `blog-large-walkin.webp` and `blog-3d-design-result.webp` are captioned "Real project" in the gallery but are generated pictures, not photographs of a job. That predates this session and was left alone rather than swapped for another generated picture. **They should be replaced with real photos of those two installs, or the captions changed** — under our own content standard a generated picture can never stand as proof of work.

## 2026-09-22
- **Team members, assignment, and the morning-of consult brief.** Michael asked for a way to put a name on a consult and on a job, and for the assigned people to be emailed everything they need on the morning of the visit.
  - New `team_members` roster (migration 0070), seeded with Michael Blair <michael@blaircustominteriors.com> and Noah Blair <noah@blaircustominteriors.com>, managed at `/crm/team.html`. A third installer can be added there without a migration.
  - New `assignments` join table — a consult or a job can carry more than one person, because both owners go out together often enough that one-assignee-per-row would have been wrong on day one. Assign from the Calendar (book + edit) and from a job's Overview tab; the crew shows as initials on the month grid and as chips on the job header and visit list.
  - New `consult_brief` email: client name, phone, email, the date and time, the address linked to Google Maps (plus an "Open in Google Maps" button), rooms, notes, who else is going, and a link back to the consult in the CRM. One email per assignee, sent as crm@ so a reply lands in the office inbox, never to the client. The wording is an editable `email_templates` row (Templates → Email); `_lib/consult-brief.js` carries a byte-identical fallback so deleting or deactivating the row cannot silence the morning email — a check in this session confirmed the two are identical.
  - It goes out on the morning of the visit, from the same cron tick as the customer reminder: after 7am Central, for consults and measures happening later today, stamped in `appointments.team_brief_sent_at` so it sends once. **Nobody assigned falls back to the whole active team** and the email says so — a visit three hours out that nobody was assigned to is exactly the one that must not go out unannounced. There is also a "Send crew brief" button on the appointment for sending it early; that one does not stamp, so the automatic brief still lands.
  - Templates → Email now exposes the HTML body. Every automated email prefers `body_html` at send time, so editing only the plain text used to change nothing in the recipient's inbox; the kind list also gained `consult_brief` and `review_request_visit`, which were sending but not editable.
  - Fixed while building: `assignments` rows are removed by `_lib/cascade.js` when a job or lead is purged (D1 never fires `ON DELETE CASCADE`); the brief's city-in-the-subject now survives all three address shapes we store; any template token we don't supply is blanked rather than delivered as a literal `{{token}}`; and the crew chips use a deeper terracotta (`--crew-deep`) because `--accent-ink` on `--accent-soft` measures 3.96:1, under WCAG AA — every crew element now clears 4.5:1 as painted at 375px.
- **Every word in the CRM now clears WCAG AA, measured as painted.** The 2026-09-22 mobile pass noted the shared accent tokens were below the line and worked around them locally; this fixes them at the source and folds the workaround back in.
  - **The accent is three tokens, not one.** A colour that fills well is too light to write with: the brand terracotta `--accent` (#D2683F) carried white at 3.63:1 and read as text at 3.44:1 — so *every link in the CRM* was failing, not just `.pill`. `--accent` is now fills, borders and focus rings only and is **unchanged**; `--accent-fill` (#B9542F, white on it 4.80) is a filled control with a white label; `--accent-text` (#A8481F) is the accent as text and clears 4.5:1 on every surface the CRM paints on — white 5.81, `--bg-alt` 5.52, `--bg-soft` 5.10, `--bg-hover` 4.92, `--accent-soft` 4.79. Each has a hover step. `--accent-ink` and `--accent-hover` are now aliases into the scale, so the inline `style=` attributes on the pages were fixed without touching them.
  - **`--crew-deep` is gone**, folded into `--accent-text` — it was the same #A8481F, scoped to the crew chips because fixing the shared tokens was out of scope then. One answer now, not two.
  - **The primary button.** Michael's call: the fill moves to `--accent-fill`, the shade it already turned on hover, so white passes at 4.80 and the button still reads as the same terracotta. Same for `.btn.success` (3.77 → 5.48), the quick-add button, the pipeline step dots and the Traffic toggles.
  - **Status pills, on Michael's call as well.** Their `--s-*` tokens are only ever pill text, so each moved down its own hue to ≥4.7:1 on its own tint, keeping the colour-coding: amber 2.00 → 4.70 (the "proposal" pill was the hardest word in the CRM to read), teal 2.39 → 4.74, emerald 2.41 → 4.75, slate 2.34 → 4.75, violet 3.86 → 4.70, indigo 3.99 → 4.70, cyan 2.33 → 4.70. `--danger` split into a fill (the error toast) and `--danger-text` (3.95 → 4.70 on its own tint).
  - Also caught while sweeping: the message-direction arrows (emerald at 2.54:1), the invoice sheet's uppercase labels (3.01:1), the Traffic page's muted grey (4.29:1), and the login page — which uses its own `admin.css` and needed the same fill/text split (`--color-brass-fill` / `--color-brass-text`).
  - Verified by walking every element on all 30 CRM pages, resolving the real painted background rather than the declared one, at 1280px and 375px, plus every hover and active state resolved by hand. Nothing is below 4.5:1 for text or 3:1 for a meaningful mark. The brand terracotta is untouched wherever it fills, borders or rings.

- **The CRM is usable on a phone.** Michael: some pages were too wide with no way to scroll. Every one of the 30 CRM pages was measured in a 375px viewport; 22 had content running off the side that could not be reached. Three causes, all fixed:
  - **The data-table card had `overflow: hidden`.** The Jobs list is 1,607px wide and the Leads list 1,019px — everything past the card edge was simply swallowed, on desktop as well as on a phone. It scrolls sideways now, and on a phone the first column (the client's name) is pinned so you never lose track of the row you are reading.
  - **`1fr` grid tracks.** A bare `1fr` is `minmax(auto, 1fr)` and refuses to shrink below its content's min-content width, so one long email address could push a whole column off the screen. Every track that holds free content is `minmax(0, 1fr)` now — the dashboard, the calendar grid, the job header, the lead/job two-column layouts, the reports cards.
  - **Inline `grid-template-columns`.** Reports and Templates set their columns in a `style=` attribute, which beats the stylesheet's own media query, so they stayed two-column on a phone regardless. Those now collapse.
  - Also: the month calendar shows a coloured dot per visit instead of a chip squashed to "2:3…" (tap the day for the full list, which already existed); the line-item editors on estimates, proposals, contracts and availability scroll in their own wrapper with 38px-tall inputs instead of 32px number boxes; page headers and button rows wrap; long unbreakable values (an email address, a URL) break rather than push a card off-screen; form inputs are 16px so iOS stops zooming on focus.
  - Verified by re-measuring all 30 pages at 375px: no page has content off-screen and unreachable. Desktop is unchanged — the dashboard is still two columns, the calendar still shows text chips — except that the wide tables now scroll there too, where they used to be clipped.

- Still owed: the owner should assign the Sep 23 consult (Brian Schaaf, 2:00 PM) — unassigned, so both owners will get the brief. `NCC_CRM_PASSWORD` in `~/.env` is stale and no longer logs in.

## 2026-09-19
- Footer credit link to nashvilleswebdesign.com is now `rel="nofollow noopener"` (was followed). Michael's call, estate-wide: every credit on every site, ours and clients', is nofollow from today — a credit, not a link signal; the WebSite schema creator/provider is unchanged. No other change; redeployed.

## 2026-09-17
- Operating manual added: `CLAUDE.md` (how it works), `site.json` (the manifest `fleet` reads) and this log. The old `CLAUDE.md`, where one existed, is replaced.
- Footer credit: Web Design, SEO and Hosting by Nashville's Web Design, followed link; creator/provider/maintainer on the WebSite schema
- Lifetime warranty covers custom cabinets
- Blair Custom Interiors as the parent company, custom cabinets as a service, About page rebuilt

## 2026-09-13
- Drop the SMS path from review requests
- Lower the walk-in and pantry floors, replace Klarna with the 50/25/25 payment terms
- Keep the price and label on one line in the price tiles
- Lifetime system warranty, monthly Klarna figures, SMS-ready review requests
- Sync the homepage's inline stylesheet, class-based three-button bar, prose form note
- Lead conversion: two-field forms, booking everywhere, ballpark hero, review requests

## 2026-09-12
- Ads: negatives, ad rewrites, schedule, a settings watchdog, faster landing pages

## 2026-09-10
- Staff alerts are sent as crm@ to hello@, never self-addressed
- Route staff alerts to crm@nationalclosetco.com
- CRM mail: no sends to dead domains, no self-addressed alerts with a foreign Reply-To
- Remove the 'Free · No obligation / Flexible payment options' pill above the lead form
- Never serve repo internals: build tools, ops scripts, migrations, wrangler.toml, admin setup
- Hero tagline: 'Saving marriages one closet at a time.'
- Keep the page factory and rebuild scripts with the site
- Site rebuild stage 3: blog index, competitor pages, pricing page
- Site rebuild stage 2: the homepage, halved and reordered around proof
- Site rebuild stage 1: Gallery, Our Work, About, Reviews and FAQ pages; new site navigation

## 2026-09-09
- Apply the eyebrow-contrast and CTA-bar clearance fixes to index.html's inline stylesheet too
- Landing page audit fixes: anchor the CTAs at the form, stop bots booking conversions
- Landing page: clear the fixed nav in the hero

## 2026-09-08
- Daily Ads housekeeping: also attach the 30s call conversion once the call terms are accepted
- CSP: allow analytics.google.com, stats.g/ad.doubleclick.net, Meta pixel fallback and the Cloudflare insights beacon
- CSP: allow the GA4/Ads measurement endpoints the tag actually uses; daily ad-group cutover check
- Capture GA4 client/session ids on leads; send booked consults to GA4 by Measurement Protocol
- Google Ads: free-design landing page, click-to-call conversion label, booked-consult offline upload

## 2026-09-02
- Show the rest of the Analytics the ingest was already storing
- Bill the whole remainder when the install date is already here

## 2026-09-01
- Serve the Analytics panel its figures, and say so when there are none
- Commit a portable dev-server config
- Ignore .wrangler/

## 2026-08-30
- Traffic dashboard: masonry panels, real space between sections

## 2026-08-29
- Give every ImageObject a typed creator, and every page a breadcrumb

## 2026-08-28
- Let the target keyword list be edited on the traffic page
- Add searches-that-brought-visitors, sortable columns, and keyword search
- Add a watched-keyword list to the rankings panel
- Proposals: persist internal cost rates + pay-in-full option
- Add the Google rankings panel to the CRM traffic page
- CRM: address-book picker in Book Appointment + Book links on contact/job/lead

## 2026-08-27
- Anti-spam on lead forms: Turnstile + honeypot + time-trap (fail-open)
- Scheduling invoice: state it's 25% + auto-bill balance on install day

## 2026-08-26
- Fix lead location not showing: capture Address in quick-add, store structured
- Add visible FAQ accordions + most-searched Q&A across all page categories
- Change footer design credit from Zorva Labs to Nashville's Web Design

## 2026-08-21
- Add Labor cost column to CRM Jobs list

## 2026-08-19
- Add 6 SEO blog posts (cost/comparison/buyer-guide) + Closet Cases registration
- FAQ: add People-Also-Ask questions (best/cheapest/Costco/design cost/reviews/install cost/Home Depot-Lowe's/contractor) with NCC positioned as the obvious choice

## 2026-08-17
- Fix consult reminder time: start_at is Central wall-clock, not UTC (noon was showing as 7am)

## 2026-08-16
- CRM calendar + dashboard: link appointment site address to Google Maps

## 2026-08-15
- Add automated morning-of consultation reminder email (cron sweep on advance-jobs)

## 2026-08-07
- P&L: fetch accessories/wall/mfr-discount columns in the report query (were undefined -> zeroed)
- P&L: show all expense lines (accessories, wall repair) + wall repair income, in screen and print views
- P&L/financials: default Materials expense to charged/gross ÷ 2.10 when no row saved (was showing $0)
- Job financials: derive Materials expense = Materials charged ÷ 2.10 (was backwards, zeroed gross on toggle)

## 2026-08-06
- Proposal builder: materials markup default 2.0 -> 2.10 (match calculator/financials)
- calc: enter the TOTAL client pays; list = total + discount; materials = list ÷ 2.1 (matches proposal math)
- Job financials: Materials charged auto-derives from Materials expense at a 2.10 markup (editable toggle)
- Consultation emails: '3D design' wording; drop stale window-company copy from booking confirmation

## 2026-08-05
- Fix: appointment_date/time is Central wall-clock (was shifted 5h by treating naive start_at as UTC)
- Email templates: auto-fill appointment_date/time from the appointment; strip unresolved {{tokens}} before sending to a customer
- Email: text-only sends now generate an HTML part (empty text/html rendered blank in HTML clients)

## 2026-08-04
- Traffic 'today' now Central-time across all sections: channels/pages (D1) + countries/edge-split (hourly countryMap), not just the headline number
- Traffic page: compute 'today' in Central time (was UTC — reset at 7pm CT and showed ~0)

## 2026-08-03
- Job financials: gross amount is now the calculated sum of the charged lines (section reconciles to net client)
- Manufacturer discount now supports $ or % (of materials) on job page and /calc
- Job page: install expense overridable again; parse $ and , in amount fields. Rewrite /calc to the manual model (accessories, mfr disc off materials, install auto/override, processing %/$)
- CRM financials: itemized Charged breakdown + Manufacturer discount (off materials); install calculated-only; reorder layout to match spec
- CRM financials: manual line items + accessories field; only labor auto (10%/$350); processing fee %-or-$; wall repair now a plain expense; simpler job-page layout
- contact.js: email team on filtered submissions instead of dropping them silently
- Remove company honeypot from all lead forms (browser autofill was silently dropping real leads)
- contact.js: never fake success when a lead fails to save (surface DB-unbound as 503)
- CSP: allow Google Ads conversion endpoints (googleadservices/google.com/doubleclick) so lead-form conversions can fire
- CRM: gross up deposit floor to cover materials + processing fees

## 2026-08-02
- CRM: exclude lost leads from the active Leads total badge
- Homepage: refocus 'works as hard as you do' on closets, pantries & laundry (drop garage/office lead)
- Depth image: relabel 12-inch side 'Shallow' (14-inch is the standard)
- Depth image: subtler realistic 12-inch overhang (fix broken/exaggerated version)
- Depth image: derive 12-inch from same 14-inch photo (identical items, shelf, camera)

_Only the 80 most recent commits are listed; `git log` has the rest._
