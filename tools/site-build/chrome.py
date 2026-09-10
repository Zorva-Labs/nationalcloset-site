"""Shared page chrome for nationalclosetco.com — header, drawer, footer, mobile bar,
head template, FAQ item, and the new site navigation. Everything is lifted from the
live city page so new pages match the rest of the site exactly."""
import re, html, json, os
ROOT = '/Users/zeus/nationalcloset-site'
PIN = 'ncc117'
SITE = 'https://nationalclosetco.com'
PHONE = '629-298-8241'; TEL = 'tel:+16292988241'
SMS = 'sms:+16292988241?&body=' + 'Hi%20National%20Closet%20Co%2C%20here%27s%20a%20photo%20of%20my%20closet%20%E2%80%94%20what%20would%20it%20run%3F'

SRC = open(f'{ROOT}/custom-closets-nashville.html', encoding='utf-8').read()
BODY = SRC[SRC.find('<body'):]

def block(s, start_pat):
    m = re.search(start_pat, s); assert m, start_pat
    tag = re.match(r'<(\w+)', m.group(0)).group(1)
    i = m.start(); depth = 0
    for t in re.finditer(rf'<{tag}\b[^>]*>|</{tag}>', s[i:]):
        depth += -1 if t.group(0).startswith('</') else 1
        if depth == 0: return s[i:i + t.end()]
    raise SystemExit('unclosed ' + start_pat)

HEADER = block(BODY, r'<header class="nav">')
DRAWER = block(BODY, r'<div class="drawer" id="drawer">')
FOOTER = block(BODY, r'<footer class="footer">')
MOBICTA = block(BODY, r'<div class="mobicta">')
FAQ_ITEM = block(block(BODY, r'<section[^>]*id="faq"[^>]*>'), r'<div class="faq__item">')

NAV = [('/gallery', 'Gallery'), ('/our-work', 'Our Work'), ('/custom-closet-cost-nashville', 'Pricing'),
       ('/about', 'About'), ('/reviews', 'Reviews'), ('/closet-cases', 'Closet Cases')]

def nav_links_html(current=None):
    out = ['<nav class="nav__links" aria-label="Primary">']
    for href, label in NAV:
        cur = ' aria-current="page"' if current == href else ''
        out.append(f'<a class="nav__link" href="{href}"{cur}>{label}</a>')
    out.append('</nav>'); return ''.join(out)

def drawer_links_html():
    items = [('/#top', 'Home')] + NAV
    return '\n'.join(f'  <a class="drawer__link" href="{h}"><span>{l}</span><span class="n">{i+1:02d}</span></a>' for i, (h, l) in enumerate(items))

def with_new_nav(header, drawer, current=None):
    header = re.sub(r'<nav class="nav__links".*?</nav>', nav_links_html(current), header, flags=re.S)
    drawer = re.sub(r'(<div class="drawer" id="drawer">)\s*(?:<a class="drawer__link"[^>]*>.*?</a>\s*)+', lambda m: m.group(1) + '\n' + drawer_links_html() + '\n', drawer, flags=re.S)
    return header, drawer

def faq_item(q, a_html):
    it = FAQ_ITEM
    it = re.sub(r'(<button class="faq__q"[^>]*>)(.*?)(<span class="faq__icon".*?</button>)', lambda m: m.group(1) + q + m.group(3), it, flags=re.S)
    it = re.sub(r'(<div class="faq__a-inner">).*?(</div>)', lambda m: m.group(1) + a_html + m.group(2), it, flags=re.S)
    return it

HEAD_SRC = SRC[:SRC.find('<body')]

def head(slug, title, desc, og_image, schemas, robots='index, follow, max-image-preview:large', extra_css='', og_title=None, og_desc=None):
    h = HEAD_SRC
    url = f'{SITE}/{slug}' if slug else SITE + '/'
    h = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', h)
    h = re.sub(r'<meta name="description" content="[^"]*" />', f'<meta name="description" content="{desc}" />', h)
    h = h.replace(f'{SITE}/custom-closets-nashville', url)
    h = h.replace('<meta name="robots" content="index, follow, max-image-preview:large" />', f'<meta name="robots" content="{robots}" />')
    h = re.sub(r'<meta property="og:title" content="[^"]*" />', f'<meta property="og:title" content="{og_title or title}" />', h)
    h = re.sub(r'<meta property="og:description" content="[^"]*" />', f'<meta property="og:description" content="{og_desc or desc}" />', h)
    h = h.replace('/img/hero-closet-og.jpg', og_image)
    h = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', '', h, flags=re.S)
    ld = ''.join('<script type="application/ld+json">' + json.dumps(s, ensure_ascii=False) + '</script>\n' for s in schemas)
    h = h.replace('<script async src="https://www.googletagmanager.com', ld + '<script async src="https://www.googletagmanager.com', 1)
    h = re.sub(r'styles\.css\?v=ncc\d+', f'styles.css?v={PIN}', h)
    if extra_css: h = h.replace('</head>', f'<style>\n{extra_css}\n</style>\n</head>')
    assert 'ld+json' in h and 'G-EJEDXZZWJN' in h
    return h

def breadcrumb(items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(items)]}

def webpage(slug, name, desc, image):
    url = f'{SITE}/{slug}'
    return {"@context": "https://schema.org", "@type": "WebPage", "@id": url + "#webpage", "url": url, "name": name, "description": desc,
            "isPartOf": {"@id": SITE + "/#website"}, "about": {"@id": SITE + "/#org"}, "primaryImageOfPage": SITE + image}

def page(slug, title, desc, og_image, body_html, schemas, robots='index, follow, max-image-preview:large', extra_css='', current=None):
    header, drawer = with_new_nav(HEADER, DRAWER, current or ('/' + slug if slug else None))
    out = head(slug, title, desc, og_image, schemas, robots, extra_css) + '<body id="top">\n' + header + '\n' + drawer + '\n' + body_html + '\n' + FOOTER + '\n' + MOBICTA + f'\n<script src="/js/main.js?v={PIN}" defer></script>\n</body>\n</html>\n'
    return out

def phero(crumbs, eyebrow, h1, lead):
    crumb = ' /&nbsp;'.join(f'<a href="{u}">{n}</a>' if u else n for n, u in crumbs)
    return f'''<section class="phero">
  <div class="wrap">
    <p class="crumb">{crumb}</p>
    <span class="eyebrow">{eyebrow}</span>
    <h1 style="margin-top:1rem">{h1}</h1>
    <p class="lead">{lead}</p>
  </div>
</section>'''

# ---- shared content pieces ----
REVIEWS = [
  dict(name='Amber Fraley', when='July 2026', project='Pantry + master closet', story='/blog/fraley-pantry-master-closet-makeover', story_label="See the Fraleys' pantry and closet",
       text="Holy Wow! BEST investment for our home! The pantry and closet systems were a game changer — helping us organize better, fit more items and look amazing. The process of designing, ordering and installing was easy. They were in and out quickly and cleaned up behind them, which I really appreciated. Highly recommend!"),
  dict(name='Cheryl Webb', when='June 2026', project='Pantry + master closet',
       text="Absolutely thrilled with our new pantry and master closet! The entire process was seamless, communication was excellent, and the finished product exceeded our expectations. We were also pleasantly surprised by the pricing — it was significantly more affordable than quotes we received from several other companies without sacrificing quality. Highly recommend!"),
  dict(name='Connie Rice', when='June 2026', project='Master closet + pantry',
       text="National Closet Company did an outstanding job on our master closet and pantry. From the design process to the final installation, everything was professional, organized, and exceeded our expectations. The quality of the materials and craftsmanship is excellent, and they made great use of every inch of space. We couldn't be happier with the results."),
  dict(name='Keith Vasseur', when='July 2026', project='Office storage wall', story='/blog/keith-irena-office-storage-wall', story_label="See Keith & Irena's storage wall",
       text="We would highly recommend National Closet Company. The customer service was exceptional. The materials and installation were outstanding. We are very happy with Michael Blair and his installer."),
  dict(name='Kim Sartin', when='June 2026', project='Custom closet',
       text="Great workmanship and communication! Truly a labor of love with every piece. The owners are wonderful people who stand behind their work!"),
]
GOOGLE_REVIEWS_URL = 'https://www.google.com/maps/place/?q=place_id:ChIJhxwNszEGaqwRqWPjnfc_iUE'
LEAVE_REVIEW_URL = 'https://g.page/r/Calj4533P4lBEBM/review'
RATING = '5.0'; REVIEW_COUNT = 6

def initials(name): return ''.join(p[0] for p in name.split()[:2]).upper()

def review_card(r, short=None):
    text = r['text']
    if short and len(text) > short: text = text[:short].rsplit(' ', 1)[0] + '…'
    story = f'<a class="tcard__story" href="{r["story"]}">{r["story_label"]} →</a>' if r.get('story') else ''
    return f'''<figure class="tcard" data-reveal>
  <span class="stars" aria-label="5 out of 5 stars">★★★★★</span>
  <blockquote>“{text}”</blockquote>
  {story}
  <figcaption class="tcard__who"><span class="tcard__av">{initials(r['name'])}</span><span><b>{r['name']}</b><span>{r['project']} · Google review, {r['when']}</span></span></figcaption>
</figure>'''

def rating_badge():
    return f'<a class="gbadge" href="{GOOGLE_REVIEWS_URL}" target="_blank" rel="noopener"><span class="stars">★★★★★</span> <b>{RATING}</b> from {REVIEW_COUNT} Google reviews</a>'

def ba_slider(before, after, alt_b, alt_a, cap=None):
    c = f'<figcaption class="ba__cap">{cap}</figcaption>' if cap else ''
    return f'''<figure class="ba-feature" style="margin:0">
  <div class="ba" data-ba>
    <img class="ba__img" src="{before}" alt="{alt_b}" loading="lazy" />
    <img class="ba__img ba__after" src="{after}" alt="{alt_a}" loading="lazy" />
    <span class="ba__tag ba__tag--b">Before</span><span class="ba__tag ba__tag--a">After</span>
    <span class="ba__line" aria-hidden="true"></span><span class="ba__knob" aria-hidden="true"><i></i><i></i></span>
    <input class="ba__range" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after" />
  </div>{c}
</figure>'''

def estimator(compact=False):
    return f'''<div class="est" data-estimator>
  <div class="est__grid">
    <div class="est__q"><label class="est__lbl" for="est-type">What space?</label>
      <select id="est-type" data-est="type"><option value="reachin">Reach-in closet</option><option value="walkin">Walk-in closet</option><option value="pantry">Pantry</option><option value="garage">Garage storage</option><option value="office">Home office</option><option value="laundry">Laundry / mudroom</option></select></div>
    <div class="est__q"><span class="est__lbl">How big?</span>
      <div class="est__chips" data-est="size" role="group" aria-label="Size"><button type="button" data-v="small">Small</button><button type="button" data-v="medium" class="on">Medium</button><button type="button" data-v="large">Large</button></div></div>
    <div class="est__q"><span class="est__lbl">Finish</span>
      <div class="est__chips" data-est="finish" role="group" aria-label="Finish"><button type="button" data-v="standard" class="on">Classic white</button><button type="button" data-v="wood">Wood-grain</button><button type="button" data-v="premium">Doors, glass &amp; lighting</button></div></div>
  </div>
  <div class="est__out" aria-live="polite">
    <span class="est__lead">Typically</span>
    <span class="est__range" data-est="range">$2,500 – $7,000</span>
    <span class="est__note">installed, design included. Your designer confirms an exact price at your free in-home design.</span>
  </div>
  <div class="est__actions">
    <a class="btn btn--primary" href="#consult">Get My Exact Price — Free <span class="arr">→</span></a>
    <a class="btn btn--ghost" href="{SMS}">📷 Text us a photo of your closet</a>
  </div>
</div>'''

COMPARE_ROWS = [
  ('Who you deal with', 'A family-owned local team, not a franchise', 'A franchise location paying royalties and national ad fees'),
  ('Shelf depth', '14″ deep shelves come standard', 'Typically 12″, with deeper shelves as an upgrade'),
  ('Pricing', 'One honest price, with starting prices published', '“40% off” style promotions on a marked-up list price'),
  ('Design', 'Free in-home design with a photorealistic 3D rendering', 'Varies; often a sketch, with 3D as a follow-up'),
  ('Quotes', 'Two quotes: prep-it-yourself or fully turnkey', 'Usually one'),
  ('Installation', 'Our own team, most closets in a single day', 'Varies by location'),
  ('Warranty', 'One-year workmanship guarantee plus manufacturer coverage', 'Varies'),
]
def compare_table(title='How we compare'):
    rows = ''.join(f'<tr><th scope="row">{a}</th><td class="cmp__us">{b}</td><td>{c}</td></tr>' for a, b, c in COMPARE_ROWS)
    return f'''<div class="cmp" data-reveal>
  <h3 class="cmp__title">{title}</h3>
  <div class="cmp__scroll"><table class="cmp__table">
    <thead><tr><th scope="col"></th><th scope="col" class="cmp__us">National Closet Company</th><th scope="col">Typical national brand</th></tr></thead>
    <tbody>{rows}</tbody>
  </table></div>
  <p class="cmp__foot">Free in-home design, one honest price, deeper shelves. <a href="#consult">Book yours →</a></p>
</div>'''

NEW_CSS = r'''
/* ===== New components (Sept 2026): Google rating badge, review cards, before/after,
   estimator, gallery filters, comparison table, about strip ===== */
.gbadge { display: inline-flex; align-items: center; gap: .5rem; font-weight: 700; color: var(--ink); text-decoration: none; padding: .55rem 1rem; border: 1px solid var(--line); border-radius: 100px; background: #fff; }
.gbadge .stars { color: var(--clay); letter-spacing: 2px; }
.gbadge b { font-size: 1.05rem; }
.tcard { background: #fff; border: 1px solid var(--line); border-radius: var(--radius); padding: 1.8rem 1.6rem; display: flex; flex-direction: column; gap: 1rem; height: 100%; }
.tcard .stars { color: var(--clay); letter-spacing: 2px; }
.tcard blockquote { font-family: var(--display); font-weight: 600; font-size: 1.08rem; line-height: 1.38; letter-spacing: -0.01em; margin: 0; }
.tcard__story { font-weight: 700; color: var(--clay-deep); font-size: .92rem; }
.tcard__who { display: flex; align-items: center; gap: 0.75rem; margin-top: auto; font-size: .9rem; }
.tcard__who span span { display: block; color: var(--muted); font-size: .82rem; }
.tcard__av { width: 42px; height: 42px; border-radius: 50%; background: var(--ink); color: #fff; display: grid; place-items: center; font-family: var(--display); font-weight: 800; flex: none; }
.reviews-grid { display: grid; gap: 1rem; }
@media (min-width: 700px) { .reviews-grid { grid-template-columns: 1fr 1fr; } }
@media (min-width: 1000px) { .reviews-grid { grid-template-columns: repeat(3, 1fr); } }
.ba__cap { margin-top: .8rem; font-size: .92rem; color: var(--muted); text-align: center; }
.ba__cap a { color: var(--clay-deep); font-weight: 700; }
.pair { display: grid; gap: 1rem; }
.pair figure { margin: 0; background: var(--fog); border-radius: 14px; overflow: hidden; }
.pair img { width: 100%; aspect-ratio: 3/2; object-fit: cover; display: block; }
.pair figcaption { padding: .8rem 1rem; font-size: .92rem; color: var(--ink-soft); }
.pair figcaption b { color: var(--ink); }
@media (min-width: 760px) { .pair { grid-template-columns: 1fr 1fr; } }
.est { background: #fff; border: 1px solid var(--line); border-radius: 18px; padding: 1.4rem; box-shadow: 0 30px 60px -44px rgba(0,0,0,.45); }
.est__grid { display: grid; gap: 1rem; }
@media (min-width: 800px) { .est__grid { grid-template-columns: 1fr 1fr 1.4fr; } }
.est__lbl { display: block; font-weight: 800; font-size: .74rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: .45rem; }
.est select { width: 100%; font: inherit; padding: .7rem .8rem; border: 1px solid var(--line); border-radius: 10px; background: var(--fog); }
.est__chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.est__chips button { font: inherit; font-weight: 700; font-size: .9rem; padding: .55rem .85rem; border-radius: 100px; border: 1px solid var(--line); background: var(--fog); color: var(--ink); cursor: pointer; }
.est__chips button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.est__out { margin-top: 1.2rem; padding: 1rem 1.2rem; border-radius: 14px; background: var(--fog); display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .7rem; }
.est__lead { font-weight: 700; color: var(--muted); }
.est__range { font-family: var(--display); font-weight: 900; font-size: clamp(1.5rem, 3.4vw, 2.2rem); color: var(--clay-deep); letter-spacing: -.02em; }
.est__note { flex-basis: 100%; font-size: .9rem; color: var(--muted); }
.est__actions { display: flex; flex-wrap: wrap; gap: .7rem; margin-top: 1rem; }
.price-tiles { display: grid; gap: .8rem; }
.price-tiles div { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 1rem 1.2rem; display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
.price-tiles b { font-size: 1.3rem; color: var(--clay-deep); white-space: nowrap; }
@media (min-width: 760px) { .price-tiles { grid-template-columns: repeat(3, 1fr); } }
.filters { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1.2rem 0 1.6rem; }
.filters button { font: inherit; font-weight: 700; font-size: .88rem; padding: .5rem .9rem; border-radius: 100px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; }
.filters button.on { background: var(--ink); color: #fff; border-color: var(--ink); }
.gal[hidden], .post-card[hidden] { display: none !important; }
.gal { position: relative; overflow: hidden; border-radius: 14px; background: var(--fog-2); aspect-ratio: 1/1; }
.gal__cap { transform: none; opacity: 1; background: linear-gradient(180deg, transparent, rgba(0,0,0,.62)); font-size: .85rem; font-weight: 600; }
.cmp { margin: 2rem 0; }
.cmp__title { font-family: var(--display); font-weight: 800; font-size: 1.4rem; margin: 0 0 .9rem; }
.cmp__scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.cmp__table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: .95rem; background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.cmp__table th, .cmp__table td { padding: .8rem .95rem; text-align: left; vertical-align: top; border-top: 1px solid var(--line); }
.cmp__table thead th { border-top: 0; font-weight: 800; font-size: .78rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); background: var(--fog); }
.cmp__table tbody th { font-weight: 700; color: var(--ink); width: 22%; }
.cmp__table td.cmp__us, .cmp__table th.cmp__us { color: var(--ink); background: #edf7f0; font-weight: 600; }
.cmp__table td.cmp__us::before { content: "✓ "; color: #067647; font-weight: 800; }
.cmp__foot { margin-top: .8rem; font-size: .95rem; color: var(--muted); }
.cmp__foot a { color: var(--clay-deep); font-weight: 700; }
.about-strip { display: grid; gap: 1.6rem; align-items: center; }
.about-strip img { width: 100%; border-radius: 16px; display: block; }
.about-strip .note { background: var(--paper, #fbf9f6); border-left: 4px solid var(--clay); border-radius: 12px; padding: 1.2rem 1.4rem; }
.about-strip .note p { margin: 0 0 .8rem; line-height: 1.6; }
.about-strip .sig { font-family: "Caveat", "Montserrat", cursive; font-size: 1.7rem; color: var(--clay-deep); font-weight: 700; }
.about-strip .sig small { display: block; font-family: var(--body); font-size: .82rem; color: var(--muted); font-weight: 600; }
@media (min-width: 860px) { .about-strip { grid-template-columns: 1.05fr .95fr; } }
.proof-chips { display: flex; flex-wrap: wrap; gap: .5rem .9rem; font-weight: 700; font-size: .92rem; color: var(--ink-soft); }
.proof-chips span::before { content: "✓ "; color: var(--clay); font-weight: 800; }
'''
