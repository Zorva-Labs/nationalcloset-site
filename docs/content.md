# Content — the pages, the page factory and the words

## The pages
- Hand-written HTML: 44 pages at the repo root and 29 posts in `blog/` (the list is in `CLAUDE.md` → What this is). 69 of them are in `sitemap.xml`, every post among them. A new page or post goes in the day it goes live: `site-kit submit` sends only what the sitemap lists. Six posts went unsent from 2026-08-19 to 2026-09-25; `404.html`, `calc.html`, `thank-you.html`, `free-design.html` and the customer's pages (`docs/crm.md`) are noindex.
- 19 city pages (`custom-closets-<town>.html`), 8 competitor "alternative" pages (`<brand>-alternative.html`: California Closets, Closet Factory, ClosetMaid, Closets by Design, Inspired Closets, Tailored Closet, The Closet Company, Up Closets), the pricing guide (`custom-closet-cost-nashville.html`), `warranty.html`, `service-areas.html`, `work-with-us.html` (for builders and designers).
- The blog is "Closet Cases" (`closet-cases.html` + `blog/`). **Every post is signed by Michael Blair** (the estate rule for our own sites since 2026-09-28, `~/fleet/docs/content-standards.md` §7): the BlogPosting `author` is his Person node, the `publisher` stays National Closet Company, and a visible "By Michael Blair · <date>" byline sits under the h1, linked to `/about#michael-blair`. `stage4.py → sweep_posts()` writes both, so run it after adding a post; `node ~/fleet/skills/blog-post/bin/blog-post.mjs byline nationalcloset` and `fleet audit` hold it.
- `/review` is a 302 to the Google review link, answered by `functions/_middleware.js`: the short link printed on the review cards (`tools/review-card/`) and used in the review emails.
- `calc.html` is the internal payment-schedule calculator: noindex in the page and in `_headers`, and never counted as traffic.

## The page factory
- `tools/site-build/chrome.py` (header/drawer/footer lifted from the city page, nav list, reviews data, component builders, `page()`, `COMPARE_ROWS`) and `stage4.py` (idempotent chrome sweep + page builds + `sync_inline_css()`). Build any new page with it so the chrome stays identical; new pages inherit the two-field form and the three-button mobile bar.
- Pages are built/synced by `stage4.py` (chrome sweep + page builds): run it (`python3 tools/site-build/stage4.py`, from anywhere), review, then `node build.mjs` and deploy. `stage1.py`–`stage3.py` ran once, in the September rebuild (`tools/site-build/README.md`); to add a page, import `page()` from `chrome.py` and follow `stage1.py`.
- The home page's stylesheet is inline and is re-synced by the same script (`docs/design.md`).

## The FAQs
- **The visible FAQ is the list, and the schema is written from it.** No page carries a FAQPage. `build.mjs` writes one into each page in `dist/` from what the page shows, word for word (`@id` = the canonical + `#faq`). It reads either:
  - the accordion (`.faq__item`: `button.faq__q` + `.faq__a-inner`, what `chrome.py`'s `faq_item()` writes), on the pages and 21 posts;
  - or, on the 8 posts without one, the `<p><strong>Question?</strong><br>Answer</p>` paragraphs under their "Frequently asked questions" heading.
- **To add or change a question,** edit it on the page. On `/custom-cabinets-nashville` and `/about`, edit `CAB_FAQ` or the `faq` list in `stage4.py` too, because a re-run rebuilds those two pages.
- **The build stops** on any of these:
  - a page that carries its own FAQPage;
  - an FAQ item it can't read, such as a `<div>` inside an answer;
  - an entity it can't decode, such as `&amp;ldquo;` (escaped twice, it shows as text);
  - an email address in an answer outside `<!--email_off-->…<!--/email_off-->`. Cloudflare's Email Address Obfuscation is on for the zone, as on every estate zone, and serves an unfenced address as "[email protected]", so the live page would not say what its schema says. Put the closing fence after the punctuation that follows the address, so the page's words stay as they are for `site-kit lastmod`.
- `stage1.py`, `stage2.py` and `sections/head.html` still write FAQPage blocks. They ran once and are history, and the build refuses what they would write.
- Until 2026-09-26 every page kept its own copy in its JSON-LD, and five had drifted from what they show (`CHANGELOG.md`).

## The words
- **Payment terms:** never reintroduce Klarna or monthly-financing copy. There are three payments: 50% at signing, 25% when the materials are in and the install is scheduled, 25% on install day (the contract wording is in `docs/crm.md`).
- **Services:** never re-add Murphy beds or wall beds. Custom cabinets are a service, and the lifetime warranty covers them; cabinets are priced per project, with no ranges without the owner's numbers.
- **No SMS from us:** review requests are email only (`docs/automations.md`). The "Text a photo" `sms:` link is the customer texting us, and stays.
- The ballpark ranges on the home page are the owner's (`docs/design.md` → Components).
- **The space/service vocabulary lives in two places and must match**: the public lead form's picker (`js/main.js`) and the CRM's `SERVICES` list (`crm/crm-app.js`). The CRM's is a `<datalist>`, so removing an entry never orphans an existing record — the public form's is a `<select>`, so removing one there does stop new leads picking it.
