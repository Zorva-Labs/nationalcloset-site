import re, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from chrome import *
os.chdir(ROOT)
h = open('index.html', encoding='utf-8').read()
bi = h.find('<body'); head = h[:bi]; body = h[bi:]
spans = [(m.start(), m.end()) for m in re.finditer(r'<section[^>]*>.*?</section>', body, re.S)]
assert len(spans) == 10, len(spans)
pre = body[:spans[0][0]]; post = body[spans[-1][1]:]
sec = [body[a:b] for a, b in spans]
gap = [body[spans[i][1]:spans[i + 1][0]] for i in range(9)]
MARQUEE = gap[0]; assert 'class="marquee"' in MARQUEE

# ---------------- hero (trimmed, price + warranty up top, real proof, photo-first on phones)
hero = sec[0]
old_lead = re.search(r'<p class="lead hero__sub" style="margin-top:1.1rem">.*?</p>', hero, re.S).group(0)
hero = hero.replace(old_lead, '<p class="lead hero__sub" style="margin-top:1.1rem"><strong>Custom closets, pantries, garages &amp; home offices</strong> — designed free in your home, installed by our own team, at a price normal families can afford.</p>')
old_ul = re.search(r'<ul class="hero__sub".*?</ul>', hero, re.S).group(0)
hero = hero.replace(old_ul, '<p class="hero__sub proof-chips" style="margin-top:1rem"><span>Reach-ins from $1,000</span><span>Walk-ins from $2,500</span><span>Free in-home 3D design</span><span>1-year workmanship guarantee</span></p>')
old_sa = re.search(r'<p class="hero__sub" style="margin-top:\.7rem;font-size:\.95rem">.*?</p>', hero, re.S).group(0)
hero = hero.replace(old_sa, '')
hero = hero.replace('<a class="btn btn--ghost" href="#services">Explore Services</a>', '<a class="btn btn--ghost" href="/our-work">See Real Projects</a>')
old_proof = re.search(r'<div class="hero__proof">.*?</div>', hero, re.S).group(0)
hero = hero.replace(old_proof, '<div class="hero__proof">' + rating_badge() + '</div>')
assert hero.count('data-lead') == 1

# ---------------- real projects (new)
real = f'''<!-- ================= REAL PROJECTS ================= -->
<section class="section section--fog" id="real">
  <div class="wrap">
    <div class="split" style="align-items:start">
      {ba_slider('/img/pantry-before.webp', '/img/pantry-after.webp', "Before: builder-grade wire shelving in the Fraleys' pantry", "After: the same pantry with custom white shelving, deep drawers and pull-outs", "The Fraleys' pantry, Middle Tennessee. Drag to compare. <a href='/blog/fraley-pantry-master-closet-makeover'>Read their story →</a>")}
      <div>
        <span class="eyebrow">Real homes · real prices</span>
        <h2 class="h2" style="margin-top:.8rem">Wire shelving to custom, in a day.</h2>
        <p class="lead">Every project starts as a 3D design at your free in-home consultation, so you see exactly what you're getting and one honest installed price before you say yes. Then we build it to the inch and install it, usually in a single day.</p>
        <div class="pair" style="margin-top:1.2rem">
          <figure><img src="/img/blog-3d-design.webp" alt="True-to-scale 3D design of a white reach-in closet with double-hang sections and a drawer tower" loading="lazy" width="1574" height="1142" /><figcaption><b>Your 3D design</b> — drawn to your real wall measurements.</figcaption></figure>
          <figure><img src="/img/blog-3d-design-result.webp" alt="The same reach-in closet installed and filled with clothing, baskets and shoes" loading="lazy" width="1232" height="864" /><figcaption><b>Brought to life</b> — this reach-in: <b>$2,290 installed.</b></figcaption></figure>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:.7rem;margin-top:1.3rem">
          <a class="btn btn--primary" href="/our-work">See Our Work <span class="arr">→</span></a>
          <a class="btn btn--ghost" href="/gallery">Browse the gallery</a>
        </div>
      </div>
    </div>
  </div>
</section>
'''

# ---------------- reviews (real Google reviews)
reviews = f'''<!-- ================= REVIEWS ================= -->
<section class="section" id="reviews">
  <div class="wrap">
    <div class="sec-head--split" style="margin-bottom:1.6rem;align-items:end">
      <div data-reveal>
        <span class="eyebrow">Loved by homeowners</span>
        <h2 class="h2" style="margin-top:1rem">Don't take our word for it.</h2>
      </div>
      <p data-reveal data-delay="1">{rating_badge()}</p>
    </div>
    <div class="reviews-grid">
      {review_card(REVIEWS[0], 210)}
      {review_card(REVIEWS[1], 210)}
      {review_card(REVIEWS[3], 210)}
    </div>
    <div style="text-align:center;margin-top:2rem;display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center" data-reveal>
      <a class="btn btn--ink" href="/reviews">Read all our reviews</a>
      <a class="btn btn--ghost" href="{LEAVE_REVIEW_URL}" target="_blank" rel="noopener">Leave us a review</a>
    </div>
  </div>
</section>
'''

# ---------------- why us (trimmed: short intro, two quotes, 4-step process; the 3D pair moved up)
why = sec[2]
i_3d = why.find('<div style="margin-top:3.2rem" data-reveal>'); i_p = why.find('<p style="max-width:62ch')
i_cta = why.find('<div style="margin-top:1.6rem" data-reveal>')
assert 0 < i_3d < i_p < i_cta
why = why[:i_3d] + '</div>\n\n    ' + why[i_cta:]
old_head = re.search(r'<div class="sec-head" style="max-width:70ch;margin-inline:auto" data-reveal>.*?</div>\n\n    <div id="two-quotes"', why, re.S).group(0)
new_head = '''<div class="sec-head" style="max-width:70ch;margin-inline:auto" data-reveal>
      <span class="eyebrow" style="justify-content:center">Why homeowners choose us</span>
      <h2 class="h2" style="margin-top:1rem">We're not a franchise — and you'll feel it in the price.</h2>
      <p class="lead" style="margin-top:1.1rem">No franchise royalties, no national ad budget, no showroom to fund. Every dollar goes into the closet: <strong>14&Prime; deep shelves as standard</strong> where the big brands install 12&Prime;, and one honest price instead of a "40% off" on a marked-up list. We're happily obsessed with every shelf and drawer — around here they call us <span style="font-family:'Caveat','Montserrat',cursive;color:var(--clay-deep);font-weight:700;font-size:1.5em;line-height:1">closet freaks</span>.</p>
    </div>

    <div id="two-quotes"'''
why = why.replace(old_head, new_head)
assert 'blog-3d-design' not in why and 'two-quotes' in why and 'id="process"' in why

# ---------------- pricing + estimator (new)
pricing = f'''<!-- ================= PRICING + ESTIMATOR ================= -->
<section class="section section--fog" id="pricing">
  <div class="wrap">
    <div class="sec-head--split" style="margin-bottom:1.6rem">
      <div data-reveal>
        <span class="eyebrow">Honest, upfront pricing</span>
        <h2 class="h2" style="margin-top:1rem">What a custom closet actually costs.</h2>
      </div>
      <p class="lead" data-reveal data-delay="1">Typical installed prices, design included. Pick your space below for a range, then get the exact number free at your in-home design. <a href="/custom-closet-cost-nashville" style="color:var(--clay-deep);font-weight:700">Full pricing guide →</a></p>
    </div>
    <div class="price-tiles" data-reveal>
      <div><span>Reach-in closet</span><b>from $1,000</b></div>
      <div><span>Walk-in closet</span><b>from $2,500</b></div>
      <div><span>Custom pantry</span><b>from $1,500</b></div>
      <div><span>Garage storage</span><b>from $2,500</b></div>
      <div><span>Home office</span><b>from $2,000</b></div>
      <div><span>Laundry / mudroom</span><b>from $1,500</b></div>
    </div>
    <div style="margin-top:1.4rem" data-reveal>{estimator()}</div>
  </div>
</section>
'''

# ---------------- about strip (new)
about = f'''<!-- ================= ABOUT STRIP ================= -->
<section class="section" id="family">
  <div class="wrap">
    <div class="about-strip">
      <div>
        <span class="eyebrow">Family-owned · not a franchise</span>
        <h2 class="h2" style="margin-top:.8rem">Meet the family behind the closets.</h2>
        <div class="note" style="margin-top:1.2rem" data-reveal>
          <p><strong>Hi, I'm Michael Blair.</strong> My family started National Closet Company in Gallatin because we kept watching neighbors pay national-brand prices for closets that were marked up just so they could be "discounted."</p>
          <p>We're a small team, so the person who measures your closet is the person who answers the phone. You get a free 3D design, two quotes, 14-inch shelves as standard, and most installs are done in a single day.</p>
          <p class="sig">Michael Blair<small>Founder, National Closet Company · Gallatin, TN</small></p>
        </div>
        <p style="margin-top:1.2rem"><a class="btn btn--ghost" href="/about">More about us <span class="arr">→</span></a></p>
      </div>
      <img src="/img/ncc-truck.webp" alt="The National Closet Company truck, lettered 'Closet Freaks', parked in a Middle Tennessee neighborhood" width="1600" height="600" loading="lazy" />
    </div>
  </div>
</section>
'''

# ---------------- gallery teaser (replaces the 37-image wall)
teaser_imgs = [('/img/insp-walkin-1.webp', 'Walk-in closet'), ('/img/insp-pantry-1.webp', 'Pantry'), ('/img/insp-reachin-1.webp', 'Reach-in closet'), ('/img/insp-garage-1.webp', 'Garage storage'), ('/img/svc-office.webp', 'Home office'), ('/img/insp-laundry-1.webp', 'Laundry &amp; mudroom')]
alts = dict(re.findall(r'<img[^>]+src="([^"?]+)[^"]*"[^>]*alt="([^"]*)"', sec[3]))
gal = f'''<!-- ================= GALLERY TEASER ================= -->
<section class="section section--fog" id="work">
  <div class="wrap">
    <div class="sec-head--split" style="margin-bottom:1.6rem">
      <div data-reveal>
        <span class="eyebrow">Inspiration</span>
        <h2 class="h2" style="margin-top:1rem">Closet &amp; pantry inspiration.</h2>
      </div>
      <p class="lead" data-reveal data-delay="1">Ideas by room to spark your own space. Find a look you love, then let's design one built around you.</p>
    </div>
    <div class="gallery">
      {''.join(f'<a class="gal" href="/gallery" data-reveal><img src="{s}" alt="{alts.get(s, l)}" loading="lazy" /><span class="gal__cap">{l}</span></a>' for s, l in teaser_imgs)}
    </div>
    <p style="text-align:center;margin-top:1.8rem" data-reveal><a class="btn btn--primary" href="/gallery">See the Full Gallery <span class="arr">→</span></a></p>
  </div>
</section>
'''

# ---------------- recent projects + blog (replaces blog + ideas)
proj = f'''<!-- ================= RECENT PROJECTS + BLOG ================= -->
<section class="section" id="blog">
  <div class="wrap">
    <div class="sec-head--split" style="margin-bottom:2.4rem">
      <div data-reveal>
        <span class="eyebrow">Recent projects &amp; closet cases</span>
        <h2 class="h2" style="margin-top:1rem">Real projects,<br>straight answers.</h2>
      </div>
      <p class="lead" data-reveal data-delay="1">Actual Middle Tennessee installs with the price, plus no-nonsense pricing advice from our team.</p>
    </div>
    <div class="post-grid">
      <a class="post-card" href="/blog/fraley-pantry-master-closet-makeover" data-reveal>
        <div class="post-card__img"><img src="/img/blog-fraley-closet.webp" alt="The Fraleys' new custom master walk-in closet" loading="lazy" /></div>
        <div class="post-card__body"><span class="tag">Real project</span><h3>Wire shelving to custom: the Fraleys' pantry &amp; master closet</h3><p>Builder-grade wire shelving replaced with custom systems in a day. "Holy Wow! BEST investment for our home."</p><span class="post-card__meta">Before &amp; after photos</span></div>
      </a>
      <a class="post-card" href="/blog/keith-irena-office-storage-wall" data-reveal data-delay="1">
        <div class="post-card__img"><img src="/img/blog-office-storage-after.webp" alt="Keith and Irena's floor-to-ceiling office storage wall" loading="lazy" /></div>
        <div class="post-card__body"><span class="tag">Real project</span><h3>Keith &amp; Irena's floor-to-ceiling office storage wall</h3><p>A beautiful home with almost no closets, solved with one custom wall. "Very happy with Michael Blair and his installer."</p><span class="post-card__meta">Before &amp; after photos</span></div>
      </a>
      <a class="post-card" href="/blog/large-walk-in-closet-6700" data-reveal data-delay="2">
        <div class="post-card__img"><img src="/img/blog-large-walkin.webp" alt="Large custom white walk-in closet with double-hang sections, drawers and shoe shelves" loading="lazy" /></div>
        <div class="post-card__body"><span class="tag">Real project · $6,700</span><h3>A large walk-in closet for $6,700, not $12K–$17K</h3><p>The national brands quoted $12,000 to $17,000 for the same closet. Here's the one we built.</p><span class="post-card__meta">4 min read</span></div>
      </a>
    </div>
    <div style="text-align:center;margin-top:2.2rem;display:flex;gap:.8rem;flex-wrap:wrap;justify-content:center" data-reveal>
      <a class="btn btn--ghost" href="/our-work">All our work <span class="arr">→</span></a>
      <a class="btn btn--ghost" href="/closet-cases">Read the Closet Cases blog</a>
    </div>
  </div>
</section>
'''

# ---------------- FAQ (6 on the homepage, all 37 on /faq)
KEEP = ['Are you a franchise?', 'How much does a custom closet cost?', 'Do you offer discounts or run sales?', 'Do you offer a free in-home consultation?', 'How long does it take to design and install a custom closet?', 'Do your custom closets come with a warranty?']
faq = sec[7]
faq_div = block(faq, r'<div class="faq"[^>]*>')
items = re.findall(r'<div class="faq__item">.*?</div>\s*</div>\s*</div>', faq_div, re.S)
def qtext(it): return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', re.search(r'<button class="faq__q"[^>]*>(.*?)<span class="faq__icon"', it, re.S).group(1))).strip()
chosen = [it for q in KEEP for it in items if qtext(it) == q]
assert len(chosen) == 6, [qtext(i) for i in items][:8]
new_div = faq_div[:faq_div.find('<div class="faq__item">')] + '\n'.join(chosen) + '\n    </div>'
faq = faq.replace(faq_div, new_div + '\n    <p style="margin-top:1.2rem"><a class="btn btn--ghost" href="/faq">See all 37 questions <span class="arr">→</span></a></p>')
faq = faq.replace('<p class="lead">Everything you might be wondering before you book your free design consultation.</p>', '<p class="lead">The six questions we hear most. The full list is on the FAQ page.</p>')
# head FAQPage schema -> the same 6
def fix_schema(m):
    d = json.loads(m.group(1))
    if d.get('@type') == 'FAQPage':
        d['mainEntity'] = [q for q in d['mainEntity'] if q['name'].strip() in KEEP]
        assert len(d['mainEntity']) == 6, len(d['mainEntity'])
    return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>'
head = re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix_schema, head, flags=re.S)

# ---------------- CSS: photo-first hero on phones; .split/.two-col present in the inline copy?
mobile_css = '''
/* Phones: show the closet photo as a band above the copy instead of a faded backdrop. */
@media (max-width: 899px) {
  .hero { padding-top: calc(var(--nav-h) + .9rem); }
  .hero__bg { position: relative; inset: auto; z-index: 0; height: 230px; margin: 0 1.25rem 1.1rem; border-radius: 16px; }
  .hero__bg img { animation: none; opacity: 1; transform: none; }
  .hero__bg::after { background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.22)); }
}
'''
i = head.find('</style>'); head = head[:i] + mobile_css + head[i:]
for sel in ('.split', '.two-col'):
    if not re.search(r'^' + re.escape(sel) + r'\s*\{', head, re.M):
        rules = re.findall(r'^' + re.escape(sel) + r'[^{]*\{[^}]*\}', open('css/styles.css', encoding='utf-8').read(), re.M)
        media = re.findall(r'@media[^{]*\{[^{}]*' + re.escape(sel) + r'[^{}]*\{[^}]*\}\s*\}', open('css/styles.css', encoding='utf-8').read())
        i = head.find('</style>'); head = head[:i] + '\n'.join(rules + media) + '\n' + head[i:]
        print('copied', sel, 'rules into the inline block:', len(rules), 'plus', len(media), 'media')

order = [hero, MARQUEE, real, reviews, gap[1], sec[1], why, pricing, about, gal, proj, gap[6], faq, gap[7], sec[8]]
out = head + pre + '\n'.join(order) + post
open('index.html', 'w', encoding='utf-8').write(out)
print('index.html written:', len(out), 'bytes; sections:', len(re.findall(r'<section\b', out)))
