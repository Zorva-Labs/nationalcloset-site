# Design — the look, the header, the components and the pictures

## The look
- "Crisp Architectural": white, charcoal and terracotta over fog. The tokens are the `:root` of `css/styles.css` (the terracotta is `--clay`, #d2683f; `--ink` the charcoal).
- Montserrat for display and body (`--display`, `--body`), from Google Fonts on every page but the home page, which inlines the self-hosted `fonts/montserrat-latin.woff2`. Caveat, self-hosted, is the handwritten accent (signatures, the slogan, the verse). The stylesheet's header comment still names Archivo and Hanken Grotesk; no token uses them.

## The header
- Parent-company bar (`.nav__parent`, "A division of Blair Custom Interiors"): `--nav-h` is 100px on phones and 116px from 1100px. The desktop inline nav starts at **1100px**; layout breakpoints stay at 940.
- The nav, in order: Gallery, Our Work, Cabinets (third), Pricing, About, Reviews, Closet Cases.

## Components (`js/main.js` + `css/styles.css`)
- `[data-ba]` before/after slider; `[data-estimator]` + `[data-ballpark]` (ranges: walk-in from $2,000, pantry $1,000, reach-in $1,000, garage $2,500, office $2,000, laundry $1,500 — owner-set); `[data-filters]` filter chips; `.cmp` compare table; `.gbadge` rating badge; `.tcard` review card; the `track()` layer (`docs/tracking.md`).
- The mobile bar has three buttons, one of them "Text a photo" (an `sms:` link; a small pill on desktop).

## The home page's inline stylesheet
- **`index.html` carries its own inline copy of the stylesheet** (`<style id="ncc-inline-css">`) — a fix to `css/styles.css` skips the homepage unless re-synced with `stage4.py sync_inline_css()`, which also keeps the Montserrat `@font-face` lines the block needs. Never paste `styles.css` over it by hand. Classes that exist only in the inline block render unstyled elsewhere.

## The landing page
- `/free-design` (noindex, the paid landing page) keeps its own CSS inline. Landing-page anchors belong on the form wrapper with `scroll-margin-top: calc(var(--nav-h) + 1rem)`; `.lp-hero` needs `padding-top` like `.hero` because `.nav` is fixed.

## The pictures
- **Look images:** every generated picture on the site (the hero, the `insp-*` inspiration set, the `svc-*` service tiles, the `cab-*` cabinet shots, the photographic blog headers) is defined in `tools/images/` — `rules.js` is the brief every picture obeys (framed panel fronts, real pulls, bare wood/tile floor, no window, no island, no glass doors or shelving, no text), `manifest.js` is one entry per image (subject, aspect, output size, alt), `generate.mjs` calls Venice and `convert.mjs` writes the exact WebP and OG sizes the site serves.
- Redo one by name: `set -a; . ~/.env; set +a; OUT_DIR=/tmp/ncc-img node tools/images/generate.mjs <slug> && OUT_DIR=/tmp/ncc-img node tools/images/convert.mjs <slug> && node tools/images/apply-alt.mjs`. Given no names, `generate.mjs` makes only what is missing from `OUT_DIR`; it reads the Venice balance first and stops on the first 402.
- **Real work is never generated** — the Fraley photos, Keith & Irena's wall, the before/after pairs and the 3D renders are not in the manifest and must stay out of it. Generated pictures set the mood; they never stand as proof of a job.
- **Image alt text is generated, not hand-written.** `tools/images/apply-alt.mjs` rewrites the `alt` of every `<img>` whose `src` resolves to a manifest entry (the responsive `-400`/`-480`/`-800` suffixes, and `-560`, `-840` and `-1200`, map back to the base image), so editing an alt by hand is undone on the next run — change it in `manifest.js` instead.
