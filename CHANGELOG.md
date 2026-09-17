# Changelog — National Closet Company

Newest first. One entry per session that changed this repo: what changed, why, what the client asked for, what is still owed. Infrastructure changes also go in `site.json` and `CLAUDE.md`. Entries dated before 2026-09-17 are reconstructed from git history; the reasoning behind them is in `CLAUDE.md` and in `~/fleet/docs/archive`.

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
