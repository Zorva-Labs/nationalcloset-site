import re, json, os, html, sys
sys.path.insert(0, os.path.dirname(__file__))
from chrome import *
S = os.path.join(os.path.dirname(__file__), 'sections')
os.chdir(ROOT)

# ------------------------------------------------------------------ main.js
js = open('js/main.js', encoding='utf-8').read()
if 'data-estimator' not in js:
    js += r'''

/* ---------- Before/after sliders, cost estimator, gallery + blog filters (Sept 2026) ---------- */
(function () {
  // Before/after: the range input drives the --x custom property the CSS clips on.
  document.querySelectorAll("[data-ba]").forEach(function (ba) {
    var r = ba.querySelector(".ba__range"); if (!r) return;
    var set = function () { ba.style.setProperty("--x", r.value + "%"); };
    r.addEventListener("input", set); set();
  });

  // Cost estimator. Ranges mirror the published cost guide; size picks a slice of
  // the range and finish scales it. Rounded to $100. Never a quote — the copy says
  // the designer confirms the exact price at the free in-home design.
  var RANGES = { reachin: [1000, 3000], walkin: [2500, 10000], pantry: [1500, 5000], garage: [2500, 8000], office: [2000, 7000], laundry: [1500, 6000] };
  var SIZE = { small: [0, 0.34], medium: [0.25, 0.7], large: [0.6, 1] };
  var FINISH = { standard: 1, wood: 1.12, premium: 1.3 };
  document.querySelectorAll("[data-estimator]").forEach(function (est) {
    var type = est.querySelector('[data-est="type"]');
    var out = est.querySelector('[data-est="range"]');
    if (!type || !out) return;
    function pick(group) { var on = est.querySelector('[data-est="' + group + '"] .on'); return on ? on.getAttribute("data-v") : null; }
    function money(n) { return "$" + Math.round(n / 100) * 100 .toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
    function calc() {
      var rg = RANGES[type.value] || RANGES.walkin, s = SIZE[pick("size")] || SIZE.medium, f = FINISH[pick("finish")] || 1;
      var span = rg[1] - rg[0];
      var lo = Math.round((rg[0] + span * s[0]) * f / 100) * 100, hi = Math.round((rg[0] + span * s[1]) * f / 100) * 100;
      out.textContent = money(lo) + " – " + money(hi) + (hi > rg[1] ? "+" : "");
      try { if (typeof gtag === "function") gtag("event", "estimate", { space: type.value, size: pick("size"), finish: pick("finish"), low: lo, high: hi }); } catch (e) {}
    }
    est.querySelectorAll(".est__chips button").forEach(function (b) {
      b.addEventListener("click", function () {
        b.parentNode.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on"); calc();
      });
    });
    type.addEventListener("change", calc);
    calc();
  });

  // Filter chips: [data-filters="#grid"] buttons with data-filter; items carry data-cat="a b".
  document.querySelectorAll("[data-filters]").forEach(function (bar) {
    var target = document.querySelector(bar.getAttribute("data-filters")); if (!target) return;
    bar.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        bar.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); }); b.classList.add("on");
        var v = b.getAttribute("data-filter");
        target.querySelectorAll("[data-cat]").forEach(function (el) {
          var cats = (el.getAttribute("data-cat") || "").split(" ");
          el.hidden = !(v === "all" || cats.indexOf(v) >= 0);
        });
      });
    });
  });
})();
'''
    open('js/main.js', 'w', encoding='utf-8').write(js); print('main.js: components added')

# ------------------------------------------------------------------ CSS (shared sheet + index inline copy)
css = open('css/styles.css', encoding='utf-8').read()
if '.gbadge {' not in css:
    css = css.rstrip('\n') + '\n' + NEW_CSS; open('css/styles.css', 'w', encoding='utf-8').write(css); print('styles.css: new component CSS appended')
idx = open('index.html', encoding='utf-8').read()
if '.gbadge {' not in idx:
    # index.html carries its own inline copy of the stylesheet; add the components to the FIRST <style> block
    i = idx.find('</style>'); idx = idx[:i] + NEW_CSS + '\n' + idx[i:]
    open('index.html', 'w', encoding='utf-8').write(idx); print('index.html: component CSS added to inline block')

# ------------------------------------------------------------------ consult section (shared, generalized)
CONSULT = block(BODY, r'<section class="section section--fog" id="consult">').replace('Book your free Nashville design', 'Book your free in-home design').replace('to book your free Nashville design', 'to book your free in-home design')

# ------------------------------------------------------------------ /gallery
work = open(f'{S}/3-work.html', encoding='utf-8').read()
imgs = re.findall(r'<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"', work)
def cat_of(src, alt):
    s = src.lower(); a = alt.lower()
    if 'garage' in s: return 'garage', 'Garage storage'
    if 'laundry' in s: return 'laundry', 'Laundry & mudroom'
    if 'pantry' in s: return 'pantry', 'Pantry'
    if 'office' in s: return 'office', 'Home office'
    if 'reachin' in s or 'feat-island' in s or 'reach-in' in a: return 'reachin', 'Reach-in closet'
    return 'walkin', 'Walk-in closet'
REAL = [
  ('/img/blog-fraley-closet.webp', 'walkin', "The Fraleys' master walk-in closet", "Real project · wire shelving to custom", '/blog/fraley-pantry-master-closet-makeover'),
  ('/img/blog-fraley-pantry.webp', 'pantry', "The Fraleys' pantry", "Real project · wire shelving to custom", '/blog/fraley-pantry-master-closet-makeover'),
  ('/img/blog-office-storage-after.webp', 'office', "Keith & Irena's office storage wall", "Real project · floor-to-ceiling storage", '/blog/keith-irena-office-storage-wall'),
  ('/img/blog-large-walkin.webp', 'walkin', 'Large walk-in closet, $6,700 installed', 'Real project · national brands quoted $12K–$17K', '/blog/large-walk-in-closet-6700'),
  ('/img/blog-3d-design-result.webp', 'reachin', 'Reach-in closet, $2,290 installed', 'Real project · designed in 3D first', '/blog/see-your-closet-in-3d'),
  ('/img/pantry-after.webp', 'pantry', 'Custom pantry, after', 'Real project · see the before/after', '/our-work'),
]
cards = []
for src, cat, title, sub, href in REAL:
    cards.append(f'<a class="gal" data-cat="{cat} real" href="{href}"><img src="{src}" alt="{html.escape(title)}" loading="lazy" /><span class="gal__cap"><b>{title}</b><br>{sub}</span></a>')
for src, alt in imgs:
    cat, label = cat_of(src, alt)
    cards.append(f'<figure class="gal" data-cat="{cat}" style="margin:0"><img src="{src}" alt="{html.escape(alt)}" loading="lazy" /><figcaption class="gal__cap">{label} · inspiration</figcaption></figure>')
FILTERS = [('all', 'All'), ('real', 'Real projects'), ('walkin', 'Walk-in'), ('reachin', 'Reach-in'), ('pantry', 'Pantry'), ('garage', 'Garage'), ('office', 'Home office'), ('laundry', 'Laundry')]
def _chip(v, l): return '<button type="button" data-filter="' + v + '"' + (' class="on"' if v == 'all' else '') + '>' + l + '</button>'
filt = '<div class="filters" data-filters="#gallery-grid" role="group" aria-label="Filter the gallery">' + ''.join(_chip(v, l) for v, l in FILTERS) + '</div>'
gallery_body = phero([('Home', '/#top'), ('Gallery', None)], 'Real projects &amp; inspiration', 'Custom closet, pantry &amp; garage gallery', 'Real Middle Tennessee installs first, then ideas to spark your own space. Every one of these is built to the inch, with 14″ deep shelves standard.') + f'''
<section class="section section--tight">
  <div class="wrap">
    {rating_badge()}
    {filt}
    <div class="gallery" id="gallery-grid">
      {''.join(cards)}
    </div>
    <p style="margin-top:2rem;text-align:center"><a class="btn btn--primary" href="#consult">Design a Space Like These <span class="arr">→</span></a> &nbsp; <a class="btn btn--ghost" href="/our-work">See the project stories</a></p>
  </div>
</section>
{CONSULT}'''
open('gallery.html', 'w', encoding='utf-8').write(page('gallery', 'Custom Closet Gallery — Real Nashville Projects &amp; Inspiration | National Closet Co.',
  'Browse real custom closet, pantry, garage and office installs across Middle Tennessee, plus inspiration by room. Family-owned, 14″ shelves standard, free in-home design.',
  '/img/blog-fraley-remodel-og.jpg', gallery_body,
  [webpage('gallery', 'Custom Closet Gallery', 'Real projects and inspiration by room from National Closet Company.', '/img/blog-fraley-remodel-og.jpg'),
   {"@context": "https://schema.org", "@type": "ImageGallery", "name": "National Closet Company project gallery", "url": SITE + "/gallery", "image": [SITE + s for s, *_ in REAL]},
   breadcrumb([('Home', SITE + '/'), ('Gallery', SITE + '/gallery')])]))
print('gallery.html:', len(cards), 'items')

# ------------------------------------------------------------------ /our-work
ourwork_body = phero([('Home', '/#top'), ('Our Work', None)], 'Real homes · real prices', 'Our work', 'Actual Middle Tennessee projects with the before, the after and the installed price. No stock photos in this section.') + f'''
<section class="section section--tight">
  <div class="wrap">
    <div class="split" style="align-items:start">
      {ba_slider('/img/pantry-before.webp', '/img/pantry-after.webp', "Before: builder-grade wire shelving in the Fraleys' pantry", "After: the same pantry with custom white shelving, deep drawers and pull-outs", "Drag to compare. <a href='/blog/fraley-pantry-master-closet-makeover'>Read the Fraleys' story →</a>")}
      <div>
        <span class="eyebrow">Pantry + master closet</span>
        <h2 class="h2" style="margin-top:.8rem">Wire shelving to custom: the Fraleys' makeover</h2>
        <p class="lead">Builder-grade wire shelving in the pantry and the master closet, replaced in a day with custom white systems built to the inch. Amber wrote the review below on Google the week after.</p>
        {review_card(REVIEWS[0], 220)}
        <p style="margin-top:1rem"><a class="btn btn--ghost" href="/blog/fraley-pantry-master-closet-makeover">See all the photos <span class="arr">→</span></a></p>
      </div>
    </div>
  </div>
</section>
<section class="section section--fog section--tight">
  <div class="wrap">
    <div class="pair">
      <figure><img src="/img/blog-office-storage-wall.webp" alt="Before and after of Keith and Irena's floor-to-ceiling office storage wall" loading="lazy" /><figcaption><b>Keith &amp; Irena's office storage wall</b> — a beautiful home with almost no closets, solved with a floor-to-ceiling wall in the home office. <a href="/blog/keith-irena-office-storage-wall" style="color:var(--clay-deep);font-weight:700">Read the story →</a></figcaption></figure>
      <figure><img src="/img/blog-large-walkin.webp" alt="Large custom white walk-in closet with double-hang sections, drawer banks and a wall of shoe shelves" loading="lazy" /><figcaption><b>A large walk-in for $6,700</b> — the national brands quoted $12,000 to $17,000 for the same closet. <a href="/blog/large-walk-in-closet-6700" style="color:var(--clay-deep);font-weight:700">See the numbers →</a></figcaption></figure>
      <figure><img src="/img/blog-3d-design.webp" alt="True-to-scale 3D design of a white reach-in closet" loading="lazy" /><figcaption><b>Your 3D design</b> — drawn to the real wall measurements at the free consultation, with one honest price. <a href="/blog/see-your-closet-in-3d" style="color:var(--clay-deep);font-weight:700">How it works →</a></figcaption></figure>
      <figure><img src="/img/blog-3d-design-result.webp" alt="The same reach-in closet installed and filled with clothing" loading="lazy" /><figcaption><b>Brought to life: $2,290 installed</b> — the same reach-in, built exactly as designed.</figcaption></figure>
    </div>
    <div style="margin-top:2.2rem;max-width:560px;margin-inline:auto">
      {ba_slider('/img/blog-closet-organization-before.webp', '/img/blog-closet-organization-after.webp', 'Before: a cluttered reach-in closet with a single rod and shelf', 'After: the same closet with double-hang rods, shelving and drawers', "A reach-in with a single rod becomes double-hang, shelves and drawers. <a href='/blog/closet-organization-ideas'>Read more →</a>")}
    </div>
    {review_card(REVIEWS[3], None).replace('data-reveal', 'data-reveal style="max-width:640px;margin:2rem auto 0"')}
    <p style="text-align:center;margin-top:2rem"><a class="btn btn--primary" href="#consult">Start Your Project — Free Design <span class="arr">→</span></a> &nbsp; <a class="btn btn--ghost" href="/gallery">Browse the gallery</a></p>
  </div>
</section>
{CONSULT}'''
open('our-work.html', 'w', encoding='utf-8').write(page('our-work', 'Our Work — Real Custom Closet Projects in Middle Tennessee | National Closet Co.',
  "Real before-and-after custom closet, pantry and office projects across Middle Tennessee with the installed price: the Fraleys' makeover, Keith & Irena's storage wall, a $6,700 walk-in and a $2,290 reach-in.",
  '/img/blog-fraley-remodel-og.jpg', ourwork_body,
  [webpage('our-work', 'Our Work', 'Real custom closet projects with before, after and price.', '/img/blog-fraley-remodel-og.jpg'), breadcrumb([('Home', SITE + '/'), ('Our Work', SITE + '/our-work')])]))
print('our-work.html written')

# ------------------------------------------------------------------ /about
steps = [('Free in-home consultation', 'We measure your space, talk through how you actually use it, and look at finishes together. No pressure, no obligation.'),
         ('Your closet in 3D, with one honest price', 'You see a photorealistic design built to your real wall measurements, and the installed price, before you decide anything.'),
         ('Built to the inch', 'Your system is manufactured to the half inch for your exact space, with 14″ deep shelves as the standard, not an upgrade.'),
         ('Installed by our own team', 'Most closets are installed in a single day by the same people you met, and we leave the room cleaner than we found it.')]
steps_html = ''.join(f'<div class="step"><div class="step__n">{i+1}</div><div><h3>{t}</h3><p>{d}</p></div></div>' for i, (t, d) in enumerate(steps))
about_body = phero([('Home', '/#top'), ('About', None)], 'Family-owned · Gallatin, Tennessee', 'Family-owned. Not a franchise.', 'National Closet Company is a small Middle Tennessee family business that designs, builds and installs custom closets at a price normal families can afford. Here is who you are dealing with, and why we build the way we do.') + f'''
<section class="section section--tight">
  <div class="wrap">
    <div class="about-strip">
      <img src="/img/ncc-truck.webp" alt="The National Closet Company truck, lettered with our services and 'Closet Freaks', parked in a Middle Tennessee neighborhood" width="1600" height="600" />
      <div class="note" data-reveal>
        <p><strong>Hi, I'm Michael Blair.</strong> My family started National Closet Company in Gallatin because we kept watching neighbors pay national-brand prices for closets that were marked up just so they could be "discounted."</p>
        <p>We do it differently. Every project gets a free in-home design you can see in 3D, one honest installed price, and two quotes so you can decide how much of the prep you want to handle yourself. Our shelves are 14 inches deep as standard, because the 12-inch shelves the big brands install don't fit real hangers and real bins.</p>
        <p>We are a small team, so the person who measures your closet is the person who answers the phone, and most installs are done in a single day. We're happily obsessed with every shelf, drawer and pull-out. Around here they call us the closet freaks, and we're fine with that.</p>
        <p class="sig">Michael Blair<small>Founder, National Closet Company</small></p>
      </div>
    </div>
    <div class="proof-chips" style="margin-top:1.6rem">
      <span>Family-owned since 2012</span><span>Based in Gallatin, TN</span><span>14″ shelves standard</span><span>Most closets installed in one day</span><span>One-year workmanship guarantee</span>
    </div>
  </div>
</section>
<section class="section section--fog section--tight">
  <div class="wrap">
    <div class="split">
      <div>
        <span class="eyebrow">How it works</span>
        <h2 class="h2" style="margin-top:.8rem">Four steps, one team</h2>
        <div class="steps" style="margin-top:1.2rem">{steps_html}</div>
      </div>
      <div>
        <span class="eyebrow">What we stand behind</span>
        <h2 class="h2" style="margin-top:.8rem">Our promise</h2>
        <ul class="feat-list" style="margin-top:1rem">
          <li><strong>One honest price.</strong> No "40% off" games on a marked-up list. The number your designer quotes is the number you pay.</li>
          <li><strong>Two quotes, always.</strong> Prep the space yourself for the lowest price, or go fully turnkey and we remove, patch, paint and install.</li>
          <li><strong>Deeper shelves.</strong> 14″ standard where the national brands install 12″, so hangers and bins actually fit.</li>
          <li><strong>Our own installers.</strong> No subcontractors. Most closets in a single day, spotless cleanup.</li>
          <li><strong>Warranty.</strong> A one-year workmanship guarantee on every install, plus the manufacturer's warranty on components. <a href="/warranty" style="color:var(--clay-deep);font-weight:700">Read the warranty →</a></li>
        </ul>
        <p style="margin-top:1.2rem">{rating_badge()}</p>
      </div>
    </div>
  </div>
</section>
<section class="section section--tight">
  <div class="wrap">
    <span class="eyebrow">Where we work</span>
    <h2 class="h2" style="margin-top:.8rem">Nashville and all of Middle Tennessee</h2>
    <p class="lead">Davidson, Williamson, Rutherford, Sumner and Wilson counties and the towns around them: Nashville, Franklin, Brentwood, Murfreesboro, Smyrna, Hendersonville, Gallatin, Lebanon, Mt. Juliet, Nolensville, Spring Hill and more. <a href="/service-areas" style="color:var(--clay-deep);font-weight:700">See every area we serve →</a></p>
    <div class="reviews-grid" style="margin-top:1.6rem">{review_card(REVIEWS[4], 200)}{review_card(REVIEWS[1], 200)}{review_card(REVIEWS[2], 200)}</div>
    <p style="margin-top:1.4rem"><a class="btn btn--ghost" href="/reviews">Read all our Google reviews <span class="arr">→</span></a></p>
  </div>
</section>
{CONSULT}'''
open('about.html', 'w', encoding='utf-8').write(page('about', 'About National Closet Company — Family-Owned Custom Closets, Gallatin TN',
  'Meet the family-owned Middle Tennessee team behind National Closet Company: why we build 14″ shelves, give two quotes and one honest price, and install most closets in a day.',
  '/img/ncc-truck-og.jpg', about_body,
  [{"@context": "https://schema.org", "@type": "AboutPage", "@id": SITE + "/about#webpage", "url": SITE + "/about", "name": "About National Closet Company", "isPartOf": {"@id": SITE + "/#website"}, "about": {"@id": SITE + "/#org"}, "primaryImageOfPage": SITE + "/img/ncc-truck-og.jpg"},
   {"@context": "https://schema.org", "@type": "Person", "@id": SITE + "/#founder", "name": "Michael Blair", "jobTitle": "Founder & Owner", "worksFor": {"@id": SITE + "/#org"}},
   breadcrumb([('Home', SITE + '/'), ('About', SITE + '/about')])]))
print('about.html written')

# ------------------------------------------------------------------ /reviews
reviews_body = phero([('Home', '/#top'), ('Reviews', None)], 'Loved by homeowners', 'What our customers say', f'Every review below is a public Google review from a Middle Tennessee homeowner we built for. We currently hold a {RATING} rating from {REVIEW_COUNT} reviews.') + f'''
<section class="section section--tight">
  <div class="wrap">
    <p>{rating_badge()}</p>
    <div class="reviews-grid" style="margin-top:1.4rem">{''.join(review_card(r) for r in REVIEWS)}</div>
    <div style="margin-top:2rem;display:flex;gap:.8rem;flex-wrap:wrap">
      <a class="btn btn--ink" href="{GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener">★ Read them on Google</a>
      <a class="btn btn--ghost" href="{LEAVE_REVIEW_URL}" target="_blank" rel="noopener">Leave us a review</a>
      <a class="btn btn--ghost" href="/our-work">See the projects behind the reviews</a>
    </div>
  </div>
</section>
{CONSULT}'''
open('reviews.html', 'w', encoding='utf-8').write(page('reviews', 'National Closet Company Reviews — 5.0 on Google | Nashville Custom Closets',
  'Read real Google reviews from Middle Tennessee homeowners about their National Closet Company pantry, master closet and office storage projects. 5.0 rating.',
  '/img/hero-closet-og.jpg', reviews_body,
  [webpage('reviews', 'National Closet Company Reviews', 'Real Google reviews from Middle Tennessee homeowners.', '/img/hero-closet-og.jpg'), breadcrumb([('Home', SITE + '/'), ('Reviews', SITE + '/reviews')])]))
print('reviews.html written')

# ------------------------------------------------------------------ /faq (all 37, from the homepage)
faq_sec = open(f'{S}/7-faq.html', encoding='utf-8').read()
items = re.findall(r'<div class="faq__item">.*?</div>\s*</div>\s*</div>', faq_sec, re.S)
qa = []
for it in items:
    q = re.search(r'<button class="faq__q"[^>]*>(.*?)<span class="faq__icon"', it, re.S).group(1).strip()
    a = re.search(r'<div class="faq__a-inner">(.*?)</div>', it, re.S).group(1).strip()
    qa.append((q, a))
head_src = open(f'{S}/head.html', encoding='utf-8').read()
faq_schema = next(json.loads(s) for s in re.findall(r'<script type="application/ld\+json">(.*?)</script>', head_src, re.S) if '"FAQPage"' in s)
call_box = '''<div class="form-card" style="margin-top:1.6rem"><strong style="font-family:var(--display);font-size:1.1rem">Still have a question?</strong><p class="muted" style="margin:.4rem 0 1rem">Call or text us and a real designer answers.</p><a class="btn btn--primary btn--block" href="tel:+16292988241">📞 Call/Text 629-298-8241</a></div>'''
faq_body = phero([('Home', '/#top'), ('FAQ', None)], 'Good questions', 'Custom closet FAQs', 'Everything homeowners ask before booking a free in-home design: cost, discounts, the process, materials, warranty and what makes us different from the national brands.') + f'''
<section class="section section--tight">
  <div class="wrap">
    <div class="split" style="align-items:start">
      <div style="order:2">{call_box}<p style="margin-top:1.2rem">{rating_badge()}</p></div>
      <div class="faq" style="order:1;grid-column:span 1">{''.join(faq_item(q, a) for q, a in qa)}</div>
    </div>
  </div>
</section>
{CONSULT}'''
open('faq.html', 'w', encoding='utf-8').write(page('faq', 'Custom Closet FAQs — Cost, Process, Warranty | National Closet Co. Nashville',
  'Answers to the questions Middle Tennessee homeowners ask about custom closets: what they cost, why we never run 40% off sales, how the free in-home 3D design works, materials, timing and warranty.',
  '/img/hero-closet-og.jpg', faq_body,
  [webpage('faq', 'Custom Closet FAQs', 'Answers about cost, process, materials and warranty.', '/img/hero-closet-og.jpg'), faq_schema, breadcrumb([('Home', SITE + '/'), ('FAQ', SITE + '/faq')])]))
print('faq.html written:', len(qa), 'questions')

# ------------------------------------------------------------------ nav on every page (not the paid landing page, which keeps on-page anchors)
changed = 0
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', '.wrangler', '.git', 'crm', 'functions')]
    for f in files:
        if not f.endswith('.html'): continue
        p = os.path.join(root, f)
        if p.endswith('free-design.html'): continue
        s = open(p, encoding='utf-8').read()
        if '<nav class="nav__links"' not in s: continue
        cur = None
        slug = os.path.normpath(p)[2:]
        if slug.endswith('.html'): slug = '/' + slug[:-5]
        if slug in ('/index',): slug = None
        for href, _ in NAV:
            if slug == href or (href == '/closet-cases' and slug and slug.startswith('/blog/')): cur = href
        ns = re.sub(r'<nav class="nav__links".*?</nav>', nav_links_html(cur), s, flags=re.S)
        ns = re.sub(r'(<div class="drawer" id="drawer">)\s*(?:<a class="drawer__link"[^>]*>.*?</a>\s*)+', lambda m: m.group(1) + '\n' + drawer_links_html() + '\n', ns, flags=re.S)
        ns = re.sub(r'(main\.js|styles\.css)\?v=ncc\d+', rf'\1?v={PIN}', ns)
        if ns != s: open(p, 'w', encoding='utf-8').write(ns); changed += 1
print('nav rewritten + pins bumped on', changed, 'pages')

# ------------------------------------------------------------------ sitemap + llms.txt
sm = open('sitemap.xml', encoding='utf-8').read()
add = ''
for slug, pr in (('gallery', '0.8'), ('our-work', '0.8'), ('about', '0.7'), ('reviews', '0.7'), ('faq', '0.6')):
    if f'{SITE}/{slug}<' not in sm:
        add += f'  <url>\n    <loc>{SITE}/{slug}</loc>\n    <lastmod>2026-09-10</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>{pr}</priority>\n  </url>\n'
if add: sm = sm.replace('</urlset>', add + '</urlset>'); open('sitemap.xml', 'w', encoding='utf-8').write(sm); print('sitemap: 5 pages added')
ll = open('llms.txt', encoding='utf-8').read()
if '/our-work' not in ll:
    ll = ll.rstrip('\n') + '\n\n## Key pages\n- Our work (real projects with prices): https://nationalclosetco.com/our-work\n- Gallery by room: https://nationalclosetco.com/gallery\n- Reviews (5.0 on Google): https://nationalclosetco.com/reviews\n- About the family behind the company: https://nationalclosetco.com/about\n- Pricing guide: https://nationalclosetco.com/custom-closet-cost-nashville\n- FAQ: https://nationalclosetco.com/faq\n'
    open('llms.txt', 'w', encoding='utf-8').write(ll); print('llms.txt: key pages added')
