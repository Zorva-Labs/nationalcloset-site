# Site build helpers (Sept 2026 rebuild)

`chrome.py` is the page factory: it lifts the header, drawer, footer, mobile bar and FAQ
item markup from `custom-closets-nashville.html`, applies the site navigation, and
assembles a page with the right head, schema and cache pin. Reusable pieces live there
too: the Google reviews, rating badge, before/after slider, cost estimator, comparison
table and the shared component CSS.

`stage1.py` built /gallery, /our-work, /about, /reviews and /faq and rewrote the nav on
every page. `stage2.py` rebuilt the homepage from the previous version's sections.
`stage3.py` fixed the blog index, the competitor pages and the pricing page. `stage4.py`
(2026-09-17) made Blair Custom Interiors the parent company in every header, drawer and
footer, built /custom-cabinets-nashville, put cabinets into the nav, services, gallery, city
pages, FAQ, sitemap, llms.txt and schema, and rebuilt /about on the Blair Custom Interiors
pattern; its chrome sweep is idempotent and can be re-run. They ran
once; the generated HTML is what is committed. To add a page, import `page()` from
`chrome.py` and follow the patterns in `stage1.py`.

FAQs: a page gets the accordion (`faq_item()`) and no FAQPage. `build.mjs` writes the
FAQPage into `dist/` from the accordion and stops on a page that carries its own, so
`stage4.py`'s two builders write none (2026-09-26); the FAQPage writers left in `stage1.py`
and `stage2.py` are history. On 2026-09-26, `stage4.py` then `tools/images/apply-alt.mjs`
rebuilt every committed page byte for byte.

Run from anywhere: `python3 tools/site-build/stage1.py` (they `os.chdir` to the repo). The
repo is `ROOT` in `chrome.py` and `stage4.py`, the checkout the script sits in (since
2026-09-28; before that the main clone's path, so a worktree run edited the main clone).

Posts: `stage4.py`'s `sweep_posts()` signs every BlogPosting (each post's own and
`/closet-cases`' `blogPost` list, and the pricing guide's `Article`) with `AUTHOR`, the Person node for Michael Blair (our own
site, so he signs; the publisher stays National Closet Company), and puts the visible
`<p class="byline">By Michael Blair · <date></p>` under each post's h1 (and the guide's), dated by
its `datePublished`. Run it after adding a post. The full run needs `tools/images/apply-alt.mjs`
after it (part 2's builders write their own alt text), then the diff is only what changed.
