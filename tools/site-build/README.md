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

Run from anywhere: `python3 tools/site-build/stage1.py` (they `os.chdir` to the repo).
