# Google Ads — stopped

**Google Ads stopped 2026-09-22** (Michael): campaign 24052252978 is paused, and closets and pantries are advertised from Blair Custom Interiors' account now (`~/blaircustominteriors-site/CLAUDE.md` → Google Ads). The two companies are affiliated and must never bid on the same terms at once: never re-enable it without splitting the terms with BCI first. Checked 2026-09-25: paused, no clicks in the last seven days. The rest of this file is the account as it ran.

## The account
- Customer `8968122786`, not under the Elopements manager: API calls use the `GOOGLE_ADS_*` set in `~/.env` with login-customer-id 8968122786.
- `scripts/ads-*.mjs` each assert the account's id and name before any call, and the ones that make changes by hand (`ads-landing-test.mjs`, and `ads-optimize-2026-09-12.mjs`, the record of the 2026-09-12 pass) validate only unless given `--apply`.
- Conversions, all primary: "Submit lead form" (label `UnZvCNvcxMwcEKmejZlE`), "Phone call lead (website click-to-call)" (`rm_UCOCV2_AcEKmejZlE`, a tap on the number, not a call), "Calls from ads (30s+)" (7752567517), and "National Closet Co (web) booked_consultation", imported from GA4 (`docs/tracking.md`).

## The campaign now (2026-11-09, still paused)
- Campaign 24052252978 "NCC Search Campaign": Maximize Clicks with a **$14 CPC ceiling**, $130/day, Search only, presence-only geo on Davidson/Williamson/Rutherford/Sumner/Wilson, 06:00–24:00 every day, all auto-apply subscriptions paused.
- Four broad-match ad groups (estate rule: consolidated broad match, no city keywords), one RSA each, set up by `scripts/ads-relaunch-prep-2026-11-09.mjs`: **Closets** → `/free-design`, **Pantries** → `/custom-pantry-nashville`, **Garage, Laundry & Wardrobes** → `/free-design`, **Custom Cabinets** → `/custom-cabinets-nashville`. The keyword lists and the ad text are in that script.
- 186 campaign negatives (DIY and retail brands, browsing words, jobs, cheap/free, products not sold, out-of-area cities, competitor names); "kitchen cabinets" came out on 2026-11-09 for the cabinets group.
- **No prices and no phone number in any ad** (the site has no prices since 2026-11-08). The price asset is unlinked. The six phrase groups of September, paused and named "(old, phrase)", still carry the old prices: never re-enable them as they stand.
- Assets: six sitelinks, seven callouts, the services snippet, images, the call asset (615) 488-3575 (asset 437809197683, "Calls from ads (30s+)"). The WhatsApp asset to the agency line is unlinked.

## The campaign as it ran (until 2026-09-22)
- Six phrase-match intent ad groups → `/free-design` (pantry → `/custom-pantry-nashville`), ~190 negatives, the same bidding, budget, geo and schedule. Baselines (2026-09-13): CTR 6.8%, CPC $10.30, IS 38%.
- The landing-page test (`scripts/ads-landing-test.mjs --report/--end`: the homepage against `/free-design`, a second RSA in each closet ad group with the ads rotated evenly) was to be decided about 2026-10-04 and stopped with the campaign; its ads are in the paused old groups.

## The daily job
- launchd `com.zorvalabs.ncc-ads-conversions` (07:15 CT, `~/bin/ncc-ads-conversions.sh`, log `~/Library/Logs/ncc-ads-conversions.log`) first runs `git pull --ff-only` in this checkout (it carries on with the local copy if the pull fails), then `scripts/ads-offline-conversions.mjs` (booked consults → GA4 MP `booked_consultation` → Ads import, 70 h window, ledger `ads_conversion_uploads`), `ads-adgroup-cutover.mjs`, `ads-guard.mjs` (restores TARGET_SPEND/$14 cap, Search-only, paused old ad group, paused auto-apply).
- The guard only pauses and restores settings, so it cannot restart the campaign. The job still runs, for the booked consults of past ad clicks (`CLAUDE.md` → Open items).

## What Google refuses
- Google refuses `UploadClickConversions` for new integrations and `CREATION_NOT_SUPPORTED` for GA4-custom actions via API, hence the GA4 Measurement Protocol route (`NCC_GA4_MP_SECRET`); auto-apply once undid the bid cap, hence the guard.
