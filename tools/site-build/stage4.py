"""Stage 4 (Sept 2026): Blair Custom Interiors as the parent company, custom cabinets as a
service, and the About page rebuilt on the Blair Custom Interiors pattern.

Part 1 — the chrome sweep over every public page:
  * top bar: "National Closet Company is a division of Blair Custom Interiors" (the short
    "A division of…" form on phones, where the bar is now a 28px strip)
  * brand tagline: Custom Closets & Cabinets (header + footer lockups)
  * primary nav + drawer: Cabinets added; footer Services column: Custom Cabinets
  * footer: parent-company block under the lockup, and the copyright line
  * drawer: parent-company line under the contact links
  * schema: parentOrganization on the business nodes
  * cache pin ncc125 -> ncc126, homepage inline stylesheet re-synced (with the two
    @font-face rules that the last sync dropped)
Part 2 builds /custom-cabinets-nashville and rebuilds /about (see below).

Run from anywhere: python3 tools/site-build/stage4.py
"""
import re, os, json, glob, html
ROOT = '/Users/zeus/nationalcloset-site'
os.chdir(ROOT)

BCI = 'https://blaircustominteriors.com'
BCI_A = f'<a href="{BCI}" target="_blank" rel="noopener">Blair Custom Interiors</a>'
PARENT_ORG = {"@type": "Organization", "name": "Blair Custom Interiors", "url": BCI + "/"}

def block(s, start_pat):
    m = re.search(start_pat, s); assert m, start_pat
    tag = re.match(r'<(\w+)', m.group(0)).group(1)
    i = m.start(); depth = 0
    for t in re.finditer(rf'<{tag}\b[^>]*>|</{tag}>', s[i:]):
        depth += -1 if t.group(0).startswith('</') else 1
        if depth == 0: return s[i:i + t.end()]
    raise SystemExit('unclosed ' + start_pat)

NAV = [('/gallery', 'Gallery'), ('/our-work', 'Our Work'), ('/custom-cabinets-nashville', 'Cabinets'), ('/custom-closet-cost-nashville', 'Pricing'),
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

TOP_OLD = '<span class="nav__top-msg">Family-owned · Serving Nashville &amp; all of Middle TN</span>'
TOP_NEW = ('<span class="nav__top-msg"><span class="nav__parent"><span class="nav__parent-co">National Closet Company is a</span>'
           '<span class="nav__parent-a">A</span> division of ' + BCI_A + '</span>'
           '<span class="nav__top-tag"> · Family-owned · Serving Nashville &amp; all of Middle TN</span></span>')

FOOTER_PARENT = ('\n        <div class="footer__parent"><strong>National Closet Company is a division of ' + BCI_A + '</strong>, '
                 'our parent company for custom cabinets, closets and interior remodeling across Nashville and Middle Tennessee.'
                 f'<br><a class="footer__parent-url" href="{BCI}" target="_blank" rel="noopener">blaircustominteriors.com ↗</a></div>')

COPY_OLD = '<p>© <span data-year>2026</span> National Closet Company. All rights reserved. · Custom Closets &amp; Closet Systems · Gallatin, TN.</p>'
COPY_NEW = ('<p>© <span data-year>2026</span> National Closet Company, a division of ' + BCI_A +
            '. All rights reserved. · Custom Closets, Cabinets &amp; Pantries · Gallatin, TN.</p>')

DRAWER_PARENT = '<p class="drawer__parent">A division of ' + BCI_A + '</p>'

PAY_STD = ('<p style="margin-top:.8rem;font-size:.9rem;line-height:1.5">💳 <strong>Three simple payments</strong> — 50% at signing, '
           '25% when your installation is scheduled, 25% on install day. No interest, and no penalty for paying early or in full.</p>')

def add_parent_org(page_html):
    """Add parentOrganization to the business nodes of every ld+json block; re-serialise only the blocks that change."""
    def fix(m):
        raw = m.group(1)
        try: d = json.loads(raw)
        except Exception: return m.group(0)
        changed = False
        def walk(n):
            nonlocal changed
            if isinstance(n, dict):
                t = n.get('@type'); i = n.get('@id', '')
                if (t in ('LocalBusiness', 'HomeAndConstructionBusiness') or (t == 'Organization' and i.endswith('#org'))) and 'parentOrganization' not in n and n.get('name') == 'National Closet Company':
                    n['parentOrganization'] = PARENT_ORG; changed = True
                for v in n.values(): walk(v)
            elif isinstance(n, list):
                for v in n: walk(v)
        walk(d)
        if not changed: return m.group(0)
        return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>'
    return re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix, page_html, flags=re.S)

def sweep(path):
    s = open(path, encoding='utf-8').read(); o = s
    if 'nav__top-msg' not in s or 'footer__bottom' not in s: return False
    # top bar (every step is idempotent so the sweep can be re-run)
    assert TOP_OLD in s or 'nav__parent' in s, path
    s = s.replace(TOP_OLD, TOP_NEW)
    # tagline (header + footer lockups)
    s = s.replace('<small>Custom Closets &amp; Pantries</small>', '<small>Custom Closets &amp; Cabinets</small>')
    # primary nav (keep the current page marker)
    m = re.search(r'<nav class="nav__links".*?</nav>', s, re.S); assert m, path
    cur = re.search(r'href="([^"]+)" aria-current="page"', m.group(0))
    s = s[:m.start()] + nav_links_html(cur.group(1) if cur else None) + s[m.end():]
    # drawer: links + parent line
    d = block(s, r'<div class="drawer" id="drawer">')
    d2 = re.sub(r'(<div class="drawer" id="drawer">)\s*(?:<a class="drawer__link"[^>]*>.*?</a>\s*)+', lambda mm: mm.group(1) + '\n' + drawer_links_html() + '\n', d, flags=re.S)
    if 'drawer__parent' not in d2:
        d2, n = re.subn(r'(<a class="btn btn--primary btn--block" href="[^"]*">[^<]*<span class="arr">→</span></a>)', r'\1\n    ' + DRAWER_PARENT, d2, count=1)
        assert n == 1, path
    s = s.replace(d, d2)
    # footer: parent block under the lockup, Custom Cabinets in Services, copyright line
    f = block(s, r'<footer class="footer">')
    f2 = f
    if 'footer__parent' not in f2:
        f2, n = re.subn(r'(<a href="/?#top" class="footer__logo".*?</a>)', lambda mm: mm.group(1) + FOOTER_PARENT, f2, count=1, flags=re.S); assert n == 1, path
    if '/custom-cabinets-nashville' not in f2:
        f2, n = re.subn(r'(<a href="/?#services">Reach-In Closet Systems</a>)', r'\1\n          <a href="/custom-cabinets-nashville">Custom Cabinets</a>', f2, count=1); assert n == 1, path
    assert COPY_OLD in f2 or 'a division of' in f2, path
    f2 = f2.replace(COPY_OLD, COPY_NEW)
    # the booking page's footer still carried the Klarna line
    f2 = re.sub(r'<p style="margin-top:\.8rem;font-size:\.9rem;line-height:1\.5">💳 <strong>Buy now, pay later with.*?</p>', PAY_STD, f2, flags=re.S)
    s = s.replace(f, f2)
    # schema + cache pin
    s = add_parent_org(s)
    s = re.sub(r'(styles\.css|main\.js)\?v=ncc\d+', r'\1?v=ncc126', s)
    if s != o: open(path, 'w', encoding='utf-8').write(s)
    return s != o

def sync_inline_css():
    """index.html inlines styles.css; keep it identical, with the self-hosted @font-face rules in front."""
    p = 'index.html'; s = open(p, encoding='utf-8').read()
    css = open('css/styles.css', encoding='utf-8').read()
    fonts = ("/* Self-hosted UI font (same-origin); the homepage does not load Google Fonts. Caveat is declared in styles.css itself. */\n"
             "@font-face{font-family:'Montserrat';font-style:normal;font-weight:100 900;font-display:swap;src:url(/fonts/montserrat-latin.woff2) format('woff2')}\n")
    i = s.find('<style id="ncc-inline-css">\n'); assert i > 0
    j = s.find('</style>', i); assert j > 0
    s = s[:i] + '<style id="ncc-inline-css">\n' + fonts + css + s[j:]
    open(p, 'w', encoding='utf-8').write(s)

if __name__ == '__main__':
    pages = sorted(p for p in glob.glob('**/*.html', recursive=True) if not p.startswith(('crm/', 'tools/', 'node_modules/')))
    done = [p for p in pages if sweep(p)]
    print('chrome sweep:', len(done), 'pages')
    sync_inline_css(); print('homepage inline CSS re-synced')


# =====================================================================================
# Part 2 — custom cabinets: the /custom-cabinets-nashville page, the homepage, the
# gallery, the city pages, the FAQ page, the sitemap, llms.txt and the lead form.
# chrome.py is imported here, after the sweep, so it lifts the updated chrome.
# =====================================================================================
CAB = '/custom-cabinets-nashville'
CAB_URL = 'https://nationalclosetco.com' + CAB
CITY_LINKS = [('Nashville', '/custom-closets-nashville'), ('Gallatin', '/custom-closets-gallatin'), ('Hendersonville', '/custom-closets-hendersonville'),
              ('Franklin', '/custom-closets-franklin'), ('Brentwood', '/custom-closets-brentwood'), ('Murfreesboro', '/custom-closets-murfreesboro'),
              ('Mt. Juliet', '/custom-closets-mt-juliet'), ('Lebanon', '/custom-closets-lebanon'), ('Spring Hill', '/custom-closets-spring-hill'),
              ('Nolensville', '/custom-closets-nolensville'), ('Smyrna', '/custom-closets-smyrna'), ('Green Hills', '/custom-closets-green-hills'),
              ('Belle Meade', '/custom-closets-belle-meade'), ('Goodlettsville', '/custom-closets-goodlettsville'), ('Hermitage', '/custom-closets-hermitage'),
              ('Old Hickory', '/custom-closets-old-hickory'), ('La Vergne', '/custom-closets-la-vergne'), ('White House', '/custom-closets-white-house'),
              ('Portland', '/custom-closets-portland')]

# Every image is described by its look, never as a project.
CAB_ROOMS = [
  ('/img/cab-island.webp',  'Kitchen cabinets &amp; islands', 'Walnut kitchen island with a fluted end panel, a brass toe rail and a honed marble top', 'Full kitchens, replacement cabinet runs, islands, pantry walls and coffee bars.'),
  ('/img/cab-hutch.webp',   'Built-in hutches &amp; dining storage', 'Built-in dining hutch painted warm cream with glass upper doors, brass latches and a walnut counter', 'Glass-front uppers, a serving counter and closed storage below, sized to the wall.'),
  ('/img/cab-mudroom.webp', 'Mudroom lockers &amp; benches', 'Mudroom with cream painted lockers, a walnut bench seat, brass hooks and cubbies with baskets', 'A locker per person, a bench with a drawer, hooks at kid height and cubbies for shoes.'),
  ('/img/cab-laundry.webp', 'Laundry room cabinets', 'Laundry room with sage cabinetry, a walnut folding counter over the washer and dryer and a brass hanging rod', 'Uppers over the machines, a folding counter, a hanging rod and a tall cabinet for the vacuum.'),
  ('/img/cab-media.webp',   'Media walls &amp; entertainment centers', 'Living room media wall with a walnut console, lit display shelves and a recessed television', 'A console, lit shelving and closed doors that hide the cables and the clutter.'),
  ('/img/cab-vanity.webp',  'Bathroom vanities', 'Floating white oak bathroom vanity with a top drawer open to show walnut organizers and a brushed brass faucet', 'Floating or furniture-style vanities with fitted drawers for the things you reach for every morning.'),
]

CAB_FAQ = [
  ('Do you build custom cabinets, or just closets?',
   'Both. National Closet Company designs and installs custom cabinets for kitchens, bathrooms, laundry rooms, mudrooms, dining rooms, media walls and home offices, as well as the custom closets and pantries we are known for. We are a division of <a class="inline" href="https://blaircustominteriors.com" target="_blank" rel="noopener">Blair Custom Interiors</a>, our family\'s custom cabinetry and interior remodeling company, so a cabinet project gets the same free in-home design, one honest price and our own installers that a closet does.'),
  ('How much do custom cabinets cost in Nashville?',
   'It depends on the linear footage, the door style, the finish and what goes inside the boxes, so we do not quote cabinets from a range the way we publish starting prices for closets. A single painted run for a laundry room and a full kitchen with an island are very different jobs. Your free in-home design visit ends with an exact, written price for your project, and there is no obligation.'),
  ('Can you replace my kitchen cabinets without a full remodel?',
   'Yes. A run of new cabinets, a new island, a pantry wall or a bank of upper cabinets can be designed and installed on its own. When a project grows into a full kitchen, bathroom or laundry remodel, our parent company, Blair Custom Interiors, coordinates the licensed plumbing and electrical trades under one schedule, so you still have one team to call.'),
  ('What door styles and finishes can I choose?',
   'Shaker, flat-panel and inset door styles in painted colors or wood-grain finishes, with the hardware you choose, soft-close doors and full-extension drawers throughout. We bring samples to your free design visit so you can hold them up in your own light.'),
  ('Do you design the cabinets, or do I need my own designer?',
   'We design them. Every project starts with in-person measurements and a photorealistic 3D rendering, so you approve the room before anything is built. If you already work with an interior designer, architect or builder, we are glad to build from their drawings and work out the details together.'),
  ('How long do custom cabinets take?',
   'Design and selections come first. Once the drawings are approved, your cabinetry is built to order and installation follows; larger projects and stained finishes take longer than a single painted run. You get a written schedule with your quote, and we tell you as soon as anything changes.'),
  ('Do you build custom cabinets near me in the Nashville area?',
   'Yes. We build custom cabinets across Nashville and all of Middle Tennessee, including Gallatin, Hendersonville, Franklin, Brentwood, Murfreesboro, Mt. Juliet, Lebanon, Spring Hill, Nolensville, Smyrna, Green Hills and Belle Meade, and within about 90 miles of Gallatin. Call or text 629-298-8241 to confirm your area.'),
]

def strip_tags(s): return re.sub(r'<[^>]+>', '', s).replace('&amp;', '&').replace('\\\'', "'")

def build_cabinets_page(C):
    title = 'Custom Cabinets Nashville TN | Kitchen, Bath &amp; Built-Ins'
    desc = 'Custom cabinets for Nashville kitchens, baths, laundry rooms, mudrooms and built-ins. Designed free in your home, built to the inch, installed by our own team.'
    assert len(html.unescape(title)) <= 60 and len(desc) <= 160, (len(html.unescape(title)), len(desc))
    rooms = ''.join(f'''<figure><img src="{src}" alt="{alt}" loading="lazy" width="1200" height="800" /><figcaption><b>{h}</b> — {cap}</figcaption></figure>''' for src, h, alt, cap in CAB_ROOMS)
    faq_items = ''.join(C.faq_item(q, a) for q, a in CAB_FAQ)
    reviews = ''.join(C.review_card(r, short=230) for r in (C.REVIEWS[1], C.REVIEWS[3], C.REVIEWS[4]))
    cities = ', '.join(f'<a class="inline" href="{u}">{n}</a>' for n, u in CITY_LINKS[:12])
    body = C.phero([('Home', '/#top'), ('Custom Cabinets', None)], 'Custom Cabinets · Nashville &amp; Middle TN',
                   'Custom Cabinets in Nashville — Kitchens, Baths, Laundry Rooms &amp; Built-Ins',
                   'The custom closet company you know now builds <strong>custom cabinets</strong>. Kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-in hutches, media walls and home offices — designed free in your home, built to the inch, and installed by our own team across Nashville and Middle Tennessee.') + f'''
<section class="section section--tight">
  <div class="wrap">
    <div class="prose">
      <figure><img src="/img/cab-kitchen-800.webp" srcset="/img/cab-kitchen-480.webp 480w, /img/cab-kitchen-800.webp 800w, /img/cab-kitchen.webp 1600w" sizes="(min-width: 900px) 720px, 100vw" alt="Cream shaker kitchen cabinets with a walnut island, honed marble counters and brushed brass hardware" width="1600" height="1066" fetchpriority="high" /><figcaption>Painted shaker cabinets, a walnut island and brass hardware — one of the looks we design in 3D before anything is built.</figcaption></figure>

      <h2>Custom cabinets, built to your walls</h2>
      <p>Stock cabinets come in fixed widths, and the gaps get hidden with filler strips. <strong>Custom cabinets</strong> are drawn to your room — the out-of-square corner, the odd ceiling height, the window that isn\'t centered — so every inch works and the finished wall looks like it was always there. We measure in person, design the room in a photorealistic 3D rendering, price it honestly, and install it with our own team.</p>
      <p>National Closet Company is a division of <a class="inline" href="https://blaircustominteriors.com" target="_blank" rel="noopener">Blair Custom Interiors</a>, our family\'s custom cabinetry and interior remodeling company. That is what lets a closet company build kitchens, vanities and built-ins to the same standard, with one team from the first measurement to the last hinge adjustment.</p>

      <h2>Custom cabinets for every room in the house</h2>
      <p>Most of our cabinet projects fall into one of these rooms. Each one starts with the same free in-home design visit.</p>
    </div>
    <div class="pair cab-rooms" style="margin-top:1.4rem">{rooms}</div>
    <div class="prose" style="margin-top:2rem">
      <ul>
        <li><strong>Kitchen cabinets</strong> — full kitchens, replacement cabinet runs, islands with seating, pantry walls, coffee bars and butler\'s pantries.</li>
        <li><strong>Bathroom vanities</strong> — floating or furniture-style vanities, linen towers and medicine cabinets with fitted drawers.</li>
        <li><strong>Laundry rooms &amp; mudrooms</strong> — upper cabinets, folding counters, hanging rods, lockers, benches and cubbies.</li>
        <li><strong>Built-ins</strong> — dining hutches, window seats, bookcases, fireplace surrounds and media walls that hide the television and the cables.</li>
        <li><strong>Home offices</strong> — built-in desks, file drawers and shelving walls, the same way we build <a class="inline" href="/#services">office storage</a>.</li>
        <li><strong>Garage &amp; utility cabinets</strong> — tall cabinets, workbench bases and wall cabinets that pair with our <a class="inline" href="/#services">garage storage systems</a>.</li>
      </ul>

      <h2>The look: painted, wood-grain, and the details that make it custom</h2>
      <div class="pair" style="margin:1rem 0 1.4rem">
        <figure><img src="/img/cab-detail.webp" alt="Sage green inset cabinets with beaded face frames, brass cup pulls, an open dovetailed drawer and a walnut open shelf" loading="lazy" width="1200" height="800" /><figcaption><b>Inset doors, brass hardware</b> — a painted finish with a furniture-style toe kick and an open walnut shelf.</figcaption></figure>
        <figure><img src="/img/cab-bar.webp" alt="Butler\'s pantry bar with fluted walnut cabinet doors, a built-in wine refrigerator and an antiqued mirror backsplash" loading="lazy" width="1200" height="800" /><figcaption><b>Wood-grain and fluted fronts</b> — a butler\'s bar with a wine refrigerator built into the run.</figcaption></figure>
      </div>
      <p>Shaker, flat-panel and inset door styles; painted colors or wood-grain finishes; brass, black, nickel or bronze hardware; soft-close doors and full-extension drawers throughout. Inside the boxes you choose the fittings: deep pot drawers, pull-out trash, spice pull-outs, tray dividers, drawer organizers and lighting. We bring samples to your design visit so you can hold them up in your own light.</p>

      <h2>How much do custom cabinets cost?</h2>
      <p>Custom cabinets are priced per project — by the linear footage, the door style, the finish and the fittings inside — so we don\'t quote them from a range the way we publish <a class="inline" href="/custom-closet-cost-nashville">starting prices for closets and pantries</a>. A painted laundry-room run and a full kitchen with an island are very different jobs. What you get instead is an <strong>exact, written price at your free in-home design</strong>, priced option by option so the decisions stay yours, and paid the same simple way as every project we do: <strong>50% at signing, 25% when installation is scheduled, 25% on install day</strong>, with no interest.</p>

      <blockquote>Custom cabinets don\'t just fit the wall — they fit the way you cook, fold, work and put things away.</blockquote>

      <h2>One family, closets and cabinets</h2>
      <p>You can start with a closet and come back for the kitchen, or do both at once. The same designer measures, the same crew installs, and the same <a class="inline" href="/warranty">warranty</a> stands behind the work. For full kitchen, bathroom and laundry remodels, our parent company <a class="inline" href="https://blaircustominteriors.com" target="_blank" rel="noopener">Blair Custom Interiors</a> coordinates the licensed plumbing and electrical trades under one schedule.</p>

      <h2>Custom cabinets across Nashville &amp; Middle TN</h2>
      <p>We design and install custom cabinets throughout <a class="inline" href="/service-areas">Nashville and all of Middle Tennessee</a> — including {cities} — and every community within about 90 miles of Gallatin. Older homes with plaster walls and rooms that are rarely square, and new builds with open plans and a flex room waiting to become something: we build to both.</p>

      <h2>Get a free cabinet design</h2>
      <p>Tell us about the room. We come out, measure, listen, and bring back a 3D rendering and a written price — no cost, no obligation. Your in-home <a class="inline" href="/book/">design visit</a> is free, and most of our customers say the price is the best surprise of the process.</p>

      <div style="margin-top:2rem;padding:1.6rem;background:var(--fog);border-radius:var(--radius);display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between">
        <div><strong style="font-family:var(--display);font-size:1.3rem">Custom cabinets, designed free in your home.</strong><br><span class="muted">Kitchens, baths, laundry, mudrooms &amp; built-ins. One honest price, three simple payments.</span></div>
        <a class="btn btn--primary" href="/book/">Book my free design visit <span class="arr">→</span></a>
      </div>
    </div>
  </div>
</section>

<section class="section section--fog section--tight">
  <div class="wrap">
    <span class="eyebrow">What customers say</span>
    <h2 class="h2" style="margin:.8rem 0 1.4rem">The same team, the same standard</h2>
    <div class="reviews-grid">{reviews}</div>
    <p style="margin-top:1.4rem">{C.rating_badge()} <a class="btn btn--ghost" href="/reviews" style="margin-left:.6rem">Read all reviews <span class="arr">→</span></a></p>
  </div>
</section>

<section class="section" id="faq">
  <div class="wrap">
    <div style="max-width:820px;margin:0 auto">
      <span class="eyebrow">Good questions</span>
      <h2 class="h2" style="margin:1rem 0 1.2rem">Custom cabinet questions, answered</h2>
      <div class="faq">{faq_items}</div>
    </div>
  </div>
</section>
''' + CONSULT
    faq_schema = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)}} for q, a in CAB_FAQ]}
    service = {"@context": "https://schema.org", "@type": "Service", "@id": CAB_URL + "#service", "serviceType": "Custom Cabinets",
               "name": "Custom Cabinets — Design, Build & Installation",
               "provider": {"@id": "https://nationalclosetco.com/#org"},
               "areaServed": {"@type": "GeoCircle", "geoMidpoint": {"@type": "GeoCoordinates", "latitude": 36.3884, "longitude": -86.4467}, "geoRadius": "144840"},
               "url": CAB_URL, "image": "https://nationalclosetco.com/img/custom-cabinets-og.jpg",
               "description": "Custom cabinets for kitchens, bathrooms, laundry rooms, mudrooms, dining rooms, media walls and home offices, designed free in your home with a 3D rendering, built to the inch and installed by National Closet Company's own team across Nashville and Middle Tennessee.",
               "keywords": "custom cabinets, cabinets, custom cabinets Nashville, kitchen cabinets, custom kitchen cabinets, bathroom vanities, laundry room cabinets, mudroom cabinets, built-in cabinets, media wall, custom cabinetry, cabinet maker Nashville",
               "hasOfferCatalog": {"@type": "OfferCatalog", "name": "Custom Cabinets", "itemListElement": [
                   {"@type": "Offer", "itemOffered": {"@type": "Service", "name": n}} for n in
                   ["Custom Kitchen Cabinets & Islands", "Bathroom Vanities", "Laundry Room Cabinets", "Mudroom Lockers & Benches", "Built-In Hutches & Bookcases", "Media Walls & Entertainment Centers", "Home Office Cabinetry", "Garage & Utility Cabinets"]]},
               "offers": {"@type": "Offer", "description": "Free in-home design consultation with a written price; 50% at signing, 25% when installation is scheduled, 25% on install day.", "priceCurrency": "USD", "availability": "https://schema.org/InStock"}}
    org_ref = {"@context": "https://schema.org", "@type": "Organization", "@id": "https://nationalclosetco.com/#org", "name": "National Closet Company", "url": "https://nationalclosetco.com/", "parentOrganization": PARENT_ORG}
    schemas = [service, faq_schema, C.breadcrumb([('Home', 'https://nationalclosetco.com/'), ('Custom Cabinets', CAB_URL)]),
               C.webpage('custom-cabinets-nashville', 'Custom Cabinets in Nashville, TN', html.unescape(desc), '/img/custom-cabinets-og.jpg'), org_ref]
    extra_css = '.cab-rooms figure img { aspect-ratio: 3/2; } .cab-rooms figcaption b { display: block; margin-bottom: .15rem; }'
    out = C.page('custom-cabinets-nashville', title, desc, '/img/custom-cabinets-og.jpg', body, schemas, extra_css=extra_css)
    out = out.replace('<meta name="description"', '<meta name="keywords" content="custom cabinets, cabinets, custom cabinets Nashville, kitchen cabinets, bathroom vanities, laundry room cabinets, mudroom cabinets, built-in cabinets, media wall cabinets, custom cabinetry Nashville TN" />\n<meta name="description"', 1)
    open('custom-cabinets-nashville.html', 'w', encoding='utf-8').write(out)
    print('built custom-cabinets-nashville.html', len(out))

def sub1(s, old, new, path, count=1):
    assert s.count(old) == count, (path, s.count(old), old[:90])
    return s.replace(old, new)

def update_homepage():
    p = 'index.html'; s = open(p, encoding='utf-8').read()
    if 'Custom Closets &amp; Custom Cabinets' in s: return
    s = sub1(s, '<title>Custom Closets &amp; Closet Organizers | Nashville TN</title>', '<title>Custom Closets &amp; Custom Cabinets | Nashville TN</title>', p)
    old_desc = 'Custom closets, closet organizers &amp; custom pantries at a price normal families can afford. Serving Nashville &amp; Middle TN — free in-home design.'
    new_desc = 'Custom closets, custom cabinets &amp; pantries at a price normal families can afford. Serving Nashville &amp; Middle TN — free in-home 3D design.'
    assert len(html.unescape(new_desc)) <= 160
    s = s.replace(old_desc, new_desc)
    s = s.replace('<meta property="og:title" content="Custom Closets &amp; Closet Organizers | Nashville TN" />', '<meta property="og:title" content="Custom Closets &amp; Custom Cabinets | Nashville TN" />')
    s = sub1(s, '<meta name="twitter:title" content="Affordable Custom Closets | National Closet Co." />', '<meta name="twitter:title" content="Custom Closets &amp; Custom Cabinets | National Closet Co." />', p)
    s = sub1(s, '<meta name="twitter:description" content="Beautiful custom-designed closets at a price normal families can afford. Custom closet systems for Nashville &amp; Middle TN — free in-home design." />',
             '<meta name="twitter:description" content="Custom closets, custom cabinets &amp; pantries at a price normal families can afford. Nashville &amp; Middle TN — free in-home 3D design." />', p)
    if 'name="keywords"' not in s:
        s = s.replace('<meta name="description"', '<meta name="keywords" content="custom closets, custom cabinets, cabinets Nashville, custom cabinets Nashville, closet organizers, closet systems, custom pantry, kitchen cabinets, built-in cabinets, custom closets Nashville" />\n<meta name="description"', 1)
    # hero lead + services lead
    s = sub1(s, '<strong>Custom closets, pantries, garages &amp; home offices</strong>', '<strong>Custom closets, custom cabinets, pantries, garages &amp; home offices</strong>', p)
    s = sub1(s, 'From a dream walk-in closet to a well-organized pantry, every space', 'From a dream walk-in closet to custom kitchen cabinets and a well-organized pantry, every space', p)
    # services grid: cabinets card first, the "See it all designed" card retired to keep the 3×3 grid
    card = f'''<a class="svc" href="{CAB}" data-reveal>
        <span class="svc__img"><img src="/img/svc-cabinets.webp" alt="Custom sage green inset cabinets with brass cup pulls, an open drawer and a walnut open shelf" loading="lazy" width="1024" height="640" /></span>
        <span class="svc__body">
          <h3>Custom Cabinets</h3>
          <p class="svc__desc">Kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, hutches and media walls — designed to your walls.</p>
          <span class="svc__arrow">→</span>
        </span>
      </a>
      '''
    s = sub1(s, '<div class="svc-grid">\n      <a class="svc" href="/book/" data-reveal>', '<div class="svc-grid">\n      ' + card + '<a class="svc" href="/book/" data-reveal>', p)
    s = re.sub(r'\s*<a class="svc svc--cta" href="/book/" data-reveal data-delay="2">.*?</a>\n', '\n', s, count=1, flags=re.S)
    assert 'class="svc svc--cta"' not in s
    # FAQ: one visible item + the schema entry
    q = 'Do you build custom cabinets too?'
    a = f'Yes. Besides closets and pantries we design and install <strong>custom cabinets</strong> — kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-in hutches and media walls. National Closet Company is a division of <a href="https://blaircustominteriors.com" target="_blank" rel="noopener" style="color:var(--clay-deep);font-weight:700">Blair Custom Interiors</a>, our family\'s custom cabinetry company, so cabinets get the same free in-home 3D design, one honest price and our own installers. <a href="{CAB}" style="color:var(--clay-deep);font-weight:700">See our custom cabinets →</a>'
    item = f'''<div class="faq__item">
          <button class="faq__q" aria-expanded="false">{q}<span class="faq__icon" aria-hidden="true"></span></button>
          <div class="faq__a"><div class="faq__a-inner">{a}</div></div>
        </div>
        '''
    s = sub1(s, '<div class="faq__item">\n          <button class="faq__q" aria-expanded="false">Do your custom closets come with a warranty?', item + '<div class="faq__item">\n          <button class="faq__q" aria-expanded="false">Do your custom closets come with a warranty?', p)
    s = sub1(s, 'See all 37 questions', 'See all 38 questions', p)
    # schema blocks
    def fix(m):
        d = json.loads(m.group(1)); changed = False
        if '@graph' in d:
            for n in d['@graph']:
                if n.get('@id', '').endswith('#org'):
                    n['description'] = "National Closet Company designs, builds and installs custom closets and custom cabinets at a price normal families can afford — walk-in and reach-in closet systems, kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-ins and media walls, home offices, garage storage and pantries across Nashville and Middle Tennessee. A division of Blair Custom Interiors."
                    n['knowsAbout'] = ["Custom closets", "Custom cabinets", "Custom cabinetry", "Kitchen cabinets", "Pantries", "Home storage systems"]; changed = True
                if n.get('@type') == 'Person' and n.get('name') == 'Michael Blair':
                    n['knowsAbout'] = ["Custom closets", "Custom cabinets", "Walk-in closet design", "Kitchen cabinetry", "Home storage systems", "Closet installation"]; changed = True
                if n.get('@type') == 'WebPage':
                    n['name'] = "Custom Closets & Custom Cabinets | National Closet Co."; changed = True
        elif d.get('@type') == 'Service' and d.get('serviceType') == 'Custom Closet Systems':
            d['serviceType'] = "Custom Closets & Custom Cabinets"
            d['description'] = "Beautiful custom-designed closets and custom cabinets at a price normal families can afford — custom closet systems, professionally designed and installed: walk-in and reach-in closets, closet organizers, custom kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-in hutches and media walls, custom pantries and pantry cabinets, home offices, garage storage and wall beds."
            d['keywords'] = "custom cabinets, cabinets, custom cabinets Nashville, kitchen cabinets, closet organizers, custom closets, closet systems, closet design, custom pantry, pantry cabinets, built-in cabinets, media wall, custom closets Nashville"
            d['hasOfferCatalog']['name'] = "Custom Closets & Cabinets"
            items = d['hasOfferCatalog']['itemListElement']
            if not any(i['itemOffered']['name'] == 'Custom Cabinets' for i in items):
                items.insert(1, {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Custom Cabinets", "url": CAB_URL}})
                items.insert(2, {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Custom Kitchen Cabinets & Islands", "url": CAB_URL}})
                items.insert(3, {"@type": "Offer", "itemOffered": {"@type": "Service", "name": "Bathroom Vanities & Built-Ins", "url": CAB_URL}})
            changed = True
        elif d.get('@type') == 'FAQPage':
            if not any(x['name'] == q for x in d['mainEntity']):
                d['mainEntity'].insert(5, {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "upvoteCount": 0, "text": strip_tags(a).replace(' See our custom cabinets →', '')}}); changed = True
        if not changed: return m.group(0)
        return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>'
    s = re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix, s, flags=re.S)
    open(p, 'w', encoding='utf-8').write(s); print('homepage updated')

def update_gallery():
    p = 'gallery.html'; s = open(p, encoding='utf-8').read()
    if 'data-filter="cabinets"' in s: return
    s = sub1(s, '<button type="button" data-filter="real">Real projects</button>', '<button type="button" data-filter="real">Real projects</button><button type="button" data-filter="cabinets">Cabinets</button>', p)
    figs = ''.join(f'<figure class="gal" data-cat="cabinets" style="margin:0"><a href="{CAB}" style="display:contents"><img src="{src}" alt="{alt}" loading="lazy" /></a><figcaption class="gal__cap">{cap} · custom cabinets</figcaption></figure>' for src, alt, cap in [
        ('/img/cab-kitchen-800.webp', 'Cream shaker kitchen cabinets with a walnut island and brass hardware', 'Kitchen cabinets &amp; island'),
        ('/img/cab-detail.webp', 'Sage green inset cabinets with brass cup pulls and an open dovetailed drawer', 'Painted inset cabinets'),
        ('/img/cab-hutch.webp', 'Built-in dining hutch painted cream with glass doors and a walnut counter', 'Built-in hutch'),
        ('/img/cab-mudroom.webp', 'Mudroom lockers with a walnut bench, brass hooks and cubbies', 'Mudroom lockers'),
        ('/img/cab-laundry.webp', 'Laundry room with sage cabinets and a walnut folding counter', 'Laundry cabinets'),
        ('/img/cab-media.webp', 'Media wall with a walnut console, lit shelves and a recessed television', 'Media wall'),
        ('/img/cab-vanity.webp', 'Floating white oak vanity with fitted drawer organizers', 'Bathroom vanity'),
        ('/img/cab-bar.webp', 'Butler\'s bar with fluted walnut doors and a wine refrigerator', 'Butler\'s bar'),
        ('/img/cab-office.webp', 'Home office with walnut built-in bookcases, a desk and a library ladder', 'Office built-ins'),
        ('/img/cab-pantry.webp', 'Tall pantry cabinet with reeded glass doors and pull-out baskets', 'Pantry cabinet')])
    # after the last real project, before the first inspiration figure
    s = sub1(s, '<figure class="gal" data-cat="walkin" style="margin:0"><img src="/img/insp-closet-1.webp"', figs + '<figure class="gal" data-cat="walkin" style="margin:0"><img src="/img/insp-closet-1.webp"', p)
    s = s.replace('<meta name="description" content="', '<meta name="description" content="', 1)
    open(p, 'w', encoding='utf-8').write(s); print('gallery updated')

def update_city_pages():
    n = 0
    for p in glob.glob('custom-closets-*.html'):
        s = open(p, encoding='utf-8').read()
        if f'<a class="inline" href="{CAB}">Custom Cabinets</a>' in s: continue
        s = sub1(s, '<li><strong>Reach-In Closet Systems</strong> — Double-hang, shelving and drawers that triple a standard reach-in closet.</li>',
                 '<li><strong>Reach-In Closet Systems</strong> — Double-hang, shelving and drawers that triple a standard reach-in closet.</li>\n'
                 f'        <li><strong><a class="inline" href="{CAB}">Custom Cabinets</a></strong> — Kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-in hutches and media walls, designed to your walls.</li>', p)
        s = re.sub(r'<h2>Custom closet systems for every (.+?) home</h2>', r'<h2>Custom closets &amp; cabinets for every \1 home</h2>', s, count=1)
        open(p, 'w', encoding='utf-8').write(s); n += 1
    print('city pages updated:', n)

def update_faq_page():
    p = 'faq.html'; s = open(p, encoding='utf-8').read()
    if 'Do you build custom cabinets' in s: return
    q, a = CAB_FAQ[0]
    a = a.replace('<a class="inline"', '<a style="color:var(--clay-deep);font-weight:700"') + f' <a href="{CAB}" style="color:var(--clay-deep);font-weight:700">See our custom cabinets →</a>'
    item = f'<div class="faq__item">\n          <button class="faq__q" aria-expanded="false">{q}<span class="faq__icon" aria-hidden="true"></span></button>\n          <div class="faq__a"><div class="faq__a-inner">{a}</div></div>\n        </div>'
    s = sub1(s, '<div class="faq" style="order:1;grid-column:span 1"><div class="faq__item">', '<div class="faq" style="order:1;grid-column:span 1">' + item + '<div class="faq__item">', p)
    s = s.replace('<h1 style="margin-top:1rem">Custom closet FAQs</h1>', '<h1 style="margin-top:1rem">Custom closet &amp; cabinet FAQs</h1>')
    def fix(m):
        d = json.loads(m.group(1))
        if d.get('@type') != 'FAQPage': return m.group(0)
        d['mainEntity'].insert(0, {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip_tags(CAB_FAQ[0][1])}})
        return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False) + '</script>'
    s = re.sub(r'<script type="application/ld\+json">(.*?)</script>', fix, s, flags=re.S)
    open(p, 'w', encoding='utf-8').write(s); print('faq page updated')

def update_sitemap_llms_forms():
    p = 'sitemap.xml'; s = open(p, encoding='utf-8').read()
    if CAB not in s:
        entry = f'  <url>\n    <loc>{CAB_URL}</loc>\n    <lastmod>2026-09-17</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.9</priority>\n  </url>\n'
        s = sub1(s, '  <url>\n    <loc>https://nationalclosetco.com/custom-pantry-nashville</loc>', entry + '  <url>\n    <loc>https://nationalclosetco.com/custom-pantry-nashville</loc>', p)
        for slug in ('about', ''):
            s = re.sub(rf'(<loc>https://nationalclosetco.com/{slug}</loc>\s*<lastmod>)[^<]+', r'\g<1>2026-09-17', s, count=1)
        open(p, 'w', encoding='utf-8').write(s); print('sitemap updated')
    # llms.txt
    p = 'llms.txt'; s = open(p, encoding='utf-8').read()
    if 'custom cabinets' not in s:
        s = sub1(s, '> National Closet Company is a family-owned (not a franchise) custom closet company that designs, builds, and professionally installs custom closet systems and whole-home storage throughout Middle Tennessee',
                 '> National Closet Company is a family-owned (not a franchise) custom closet and custom cabinet company that designs, builds, and professionally installs custom closet systems, custom cabinets and whole-home storage throughout Middle Tennessee', p)
        s = sub1(s, '- Business name: National Closet Company (also "National Closet Co.")', '- Business name: National Closet Company (also "National Closet Co.")\n- Parent company: Blair Custom Interiors (https://blaircustominteriors.com) — National Closet Company is a division of Blair Custom Interiors, the family\'s custom cabinetry and interior remodeling company in Nashville', p)
        s = sub1(s, '## Services (Custom Closet Systems)\n- Custom Walk-In Closets\n- Reach-In Closet Systems\n',
                 '## Services (Custom Closets & Custom Cabinets)\n- Custom Walk-In Closets\n- Reach-In Closet Systems\n- Custom Cabinets — kitchen cabinets and islands, bathroom vanities, laundry room and mudroom cabinetry, built-in hutches and bookcases, media walls and entertainment centers, home office cabinetry, garage and utility cabinets (https://nationalclosetco.com/custom-cabinets-nashville)\n', p)
        s = sub1(s, '- Free, no-obligation exact price at the in-home consultation. Deposit reserves your install date; balance due at completion. Financing options available.',
                 '- Custom cabinets: priced per project (linear footage, door style, finish, interior fittings) — no published range; an exact written price comes with the free in-home design\n- Free, no-obligation exact price at the in-home consultation. Every project is paid in three simple installments: 50% at signing, 25% when installation is scheduled, 25% on install day — no interest, no penalty for paying early', p)
        s = sub1(s, '- Do you build more than closets? Yes — garages, pantries, home offices, laundry/mudrooms, Murphy beds, and media/wall units.',
                 '- Do you build more than closets? Yes — custom cabinets (kitchens, baths, laundry, mudrooms, built-ins, media walls), garages, pantries, home offices, laundry/mudrooms, Murphy beds, and media/wall units.\n- Do you build custom cabinets? Yes — kitchen cabinets and islands, bathroom vanities, laundry and mudroom cabinetry, built-in hutches and media walls, designed free in your home and installed by our own team. National Closet Company is a division of Blair Custom Interiors, a Nashville custom cabinetry company.\n- How much do custom cabinets cost? Priced per project by linear footage, door style, finish and fittings; an exact written price comes with the free in-home design.', p)
        s = sub1(s, '- Pricing guide: https://nationalclosetco.com/custom-closet-cost-nashville', '- Custom cabinets (kitchens, baths, laundry, mudrooms, built-ins): https://nationalclosetco.com/custom-cabinets-nashville\n- Custom pantries: https://nationalclosetco.com/custom-pantry-nashville\n- Pricing guide: https://nationalclosetco.com/custom-closet-cost-nashville', p)
        s = s.replace('- Is there a custom closet company near me? We serve homeowners across the U.S. — call/text 629-298-8241 to confirm your area.', '- Is there a custom closet company near me? We serve homeowners across Nashville and Middle Tennessee, within about 90 miles of Gallatin, TN — call/text 629-298-8241 to confirm your area.')
        open(p, 'w', encoding='utf-8').write(s); print('llms.txt updated')
    # the post-submit "What space?" select in the lead form
    p = 'js/main.js'; s = open(p, encoding='utf-8').read()
    if '<option>Custom Cabinets</option>' not in s:
        s = sub1(s, '<option>Reach-In Closet</option><option>Pantry</option>', '<option>Reach-In Closet</option><option>Custom Cabinets</option><option>Pantry</option>', p)
        open(p, 'w', encoding='utf-8').write(s); print('main.js updated')

def part2():
    import sys; sys.path.insert(0, 'tools/site-build')
    import chrome as C
    global CONSULT
    CONSULT = block(C.BODY, r'<section class="section section--fog" id="consult">').replace('Book your free Nashville design', 'Book your free in-home design').replace('to book your free Nashville design', 'to book your free in-home design')
    build_cabinets_page(C)
    update_homepage(); update_gallery(); update_city_pages(); update_faq_page(); update_sitemap_llms_forms()

if __name__ == '__main__':
    part2()


# =====================================================================================
# Part 3 — /about rebuilt on the Blair Custom Interiors About page: hero, the owners'
# foundation paragraph (verbatim, from the BCI site) with the two owners, Michael's note,
# how we work / what we build with / who we build for, four values, the process, area
# chips, common questions and the form. NCC's own facts throughout.
# =====================================================================================
FAITH_P = ("Noah Blair and Michael Blair built their business on a simple foundation: faith in God, unwavering integrity, and a commitment to doing every job to the very best of their ability. "
           "They believe that honesty matters, even when the truth is difficult to hear, and that character is measured by what a person does when no one is watching. Their faith guides every decision, "
           "every customer interaction, and every project they undertake. Because of these values, Colossians 3:23 serves as their creed: <q class=\"verse\">“Whatever you do, work at it with all your heart, "
           "as working for the Lord, not for human masters.”</q> This verse reflects their dedication to excellence, their commitment to treating others with respect and fairness, and their belief that a job "
           "worth doing is worth doing right. Through faith, honesty, and integrity, Noah and Michael strive to earn trust, honor God, and deliver craftsmanship that stands the test of time.")

def existing_faq_answers():
    """Reuse the homepage's answers word for word so the two pages never drift."""
    s = open('index.html', encoding='utf-8').read()
    out = {}
    for m in re.finditer(r'<button class="faq__q"[^>]*>(.*?)<span class="faq__icon".*?<div class="faq__a-inner">(.*?)</div></div>', s, re.S):
        out[html.unescape(m.group(1)).strip()] = m.group(2).strip()
    return out

def build_about_page(C):
    title = 'About National Closet Company | Family-Owned, Gallatin TN'
    desc = 'Meet the family behind National Closet Company, a division of Blair Custom Interiors: faith and integrity, 14″ shelves, one honest price and our own installers.'
    assert len(title) <= 60 and len(desc) <= 160, (len(title), len(desc))
    old = open('about.html', encoding='utf-8').read()
    strip = block(old, r'<div class="about-strip">')           # the truck + Michael's note, approved copy
    steps = block(old, r'<div class="steps"')                  # the four-step process
    reviews = ''.join(C.review_card(r, short=230) for r in (C.REVIEWS[4], C.REVIEWS[1], C.REVIEWS[2]))
    answers = existing_faq_answers()
    faq = [
      ('Are you a franchise?', answers['Are you a franchise?']),
      ('Are you part of Blair Custom Interiors?', 'Yes. National Closet Company is a division of <a href="https://blaircustominteriors.com" target="_blank" rel="noopener" style="color:var(--clay-deep);font-weight:700">Blair Custom Interiors</a>, our family\'s custom cabinetry and interior remodeling company in Nashville, owned by Noah Blair and Michael Blair. Closets and pantries run under the National Closet Company name; custom cabinets, kitchens, bathrooms and built-ins draw on the same family, the same designers and the same installers.'),
      ('Do you build custom cabinets too?', answers['Do you build custom cabinets too?']),
      ('How much does a custom closet cost?', answers['How much does a custom closet cost?']),
      ('Do you offer a free in-home consultation?', answers['Do you offer a free in-home consultation?']),
      ('Do your custom closets come with a warranty?', answers['Do your custom closets come with a warranty?']),
    ]
    faq_items = ''.join(C.faq_item(q, a) for q, a in faq)
    chips = ''.join(f'<a href="{u}">{n}</a>' for n, u in CITY_LINKS) + '<a href="/service-areas">All service areas →</a>'
    values = [
      ('One honest price', 'No “40% off” games on a marked-up list. Two quotes — prep the space yourself or go fully turnkey — and the number your designer quotes is the number you pay.'),
      ('Built to last', '3/4-inch furniture board, 14″ deep shelves as the standard, soft-close hardware, and a lifetime warranty on the system for as long as you own your home.'),
      ('One accountable crew', 'The person who measures your space designs it, and our own installers put it in — no subcontractors, and one number to call.'),
      ('A clean site', 'Most closets are installed in a single day. Floors covered, dust controlled, and the room left cleaner than we found it.'),
    ]
    values_html = ''.join(f'<div class="value" data-reveal><span class="value__n">{"I II III IV".split()[i]}</span><h3>{t}</h3><p>{b}</p></div>' for i, (t, b) in enumerate(values))
    body = C.phero([('Home', '/#top'), ('About', None)], 'About · Family-owned, Gallatin, Tennessee',
                   'A family-owned closet and cabinet company that builds the whole space',
                   'National Closet Company is a small Middle Tennessee family business — not a franchise — and a division of <a href="https://blaircustominteriors.com" target="_blank" rel="noopener" style="color:var(--clay-deep);font-weight:700">Blair Custom Interiors</a>. We design, build and install custom closets, pantries, garage storage, home offices and <a href="/custom-cabinets-nashville" style="color:var(--clay-deep);font-weight:700">custom cabinets</a> at a price normal families can afford. One team measures, designs, builds and installs, so the person who measured your wall is the one who stands the system up against it.') + f'''
<section class="section section--tight" id="foundation">
  <div class="wrap">
    <div class="about-grid">
      <div>
        <span class="eyebrow">Our foundation</span>
        <h2 class="h2" style="margin-top:.8rem">A faith-based business, built on <em style="color:var(--clay);font-style:normal">integrity</em></h2>
        <p class="faith__p" style="margin-top:1.2rem">{FAITH_P}</p>
      </div>
      <div class="people" data-reveal>
        <div class="person" id="noah-blair"><span class="person__i" aria-hidden="true">NB</span><div class="person__who"><b>Noah Blair</b><span>Co-Owner</span></div></div>
        <div class="person" id="michael-blair"><span class="person__i" aria-hidden="true">MB</span><div class="person__who"><b>Michael Blair</b><span>Founder &amp; Co-Owner</span></div></div>
        <p class="people__note">Two owners, one crew, every project.</p>
        <p class="people__note">Closets and pantries under the National Closet Company name; custom cabinets, kitchens and built-ins through our parent company, <a href="https://blaircustominteriors.com" target="_blank" rel="noopener" style="color:var(--clay-deep);font-weight:700">Blair Custom Interiors</a>.</p>
      </div>
    </div>
  </div>
</section>

<section class="section section--fog section--tight">
  <div class="wrap">
    <span class="eyebrow">In Michael's words</span>
    <div style="margin-top:1.2rem">{strip}</div>
    <div class="proof-chips" style="margin-top:1.6rem">
      <span>Family-owned since 2012</span><span>Based in Gallatin, TN</span><span>A division of Blair Custom Interiors</span><span>14″ shelves standard</span><span>Most closets installed in one day</span><span>Lifetime system warranty</span>
    </div>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="about-how">
      <div class="prose">
        <h2>How we work</h2>
        <p>Every project begins in your home, because the room is the brief. We measure in person — never virtually — look at how the space is used, and listen for the things that are not on the wish list: the rod that is always too high, the corner nothing fits in, the shoes with nowhere to go. From that we build the space in a photorealistic 3D design, price it once, honestly, and give you two quotes: prep the space yourself for the lowest price, or go fully turnkey and we remove the old shelving, patch, paint and install. Nothing is built until you have seen it and approved it.</p>
        <p>Once the design is approved, your system is manufactured to the half inch for your exact walls. Our own installers put it in — most closets in a single day — and we protect the floors, control the dust and leave the room cleaner than we found it. When the last drawer is adjusted we walk the space with you, and we do not call it finished until you do.</p>
        <h2>What we build with</h2>
        <p>Closet and pantry systems are built from 3/4-inch furniture board with soft-close hardware, in classic white, wood-grain and premium finishes with doors, glass fronts and lighting. Shelves are 14 inches deep as the standard, not an upgrade, because the 12-inch shelves the national brands install don't fit real hangers and real bins. Every system carries a lifetime warranty on the components for as long as you own your home, plus a one-year guarantee on our installation workmanship — <a class="inline" href="/warranty">read the warranty</a>.</p>
        <p>Custom cabinets — kitchens, vanities, laundry and mudroom cabinetry, hutches and media walls — are built to order through our parent company, Blair Custom Interiors, in painted and wood-grain finishes with soft-close doors and full-extension drawers, and installed by the same crew. <a class="inline" href="/custom-cabinets-nashville">See our custom cabinets →</a></p>
        <h2>Who we build for</h2>
        <p>Homes across Middle Tennessee, which means two very different kinds of house. Older homes in Green Hills, Belle Meade and the historic parts of Franklin have plaster walls and rooms that are rarely square, and the system has to be built to them. New construction in Nolensville, Spring Hill, Mt. Juliet and Gallatin tends to have builder-grade wire shelving, open plans and a flex room waiting to become something.</p>
        <p>The projects range from a single reach-in closet to a whole-home package — master closet, pantry, garage, laundry room and a wall of kitchen cabinets. What they share is an owner who wants the work done properly, once, by people who will be there from the first measurement to the last adjustment.</p>
      </div>
      <figure class="about-how__media" data-reveal>
        <img src="/img/blog-fraley-closet.webp" alt="The Fraleys' custom master walk-in closet, a real National Closet Company install in Middle Tennessee" loading="lazy" width="1200" height="900" />
        <figcaption><b>A real install:</b> the Fraleys' master closet, wire shelving to custom. <a href="/blog/fraley-pantry-master-closet-makeover" style="color:var(--clay-deep);font-weight:700">See the before &amp; after →</a></figcaption>
      </figure>
    </div>
  </div>
</section>

<section class="section section--fog section--tight">
  <div class="wrap">
    <span class="eyebrow">What we stand on</span>
    <h2 class="h2" style="margin:.8rem 0 1.4rem">Four things every project gets, <em style="color:var(--clay);font-style:normal">every</em> time</h2>
    <div class="values">{values_html}</div>
    <p style="margin-top:1.4rem">{C.rating_badge()}</p>
  </div>
</section>

<section class="section section--tight">
  <div class="wrap">
    <div class="split" style="align-items:start">
      <div>
        <span class="eyebrow">The process</span>
        <h2 class="h2" style="margin-top:.8rem">Four steps, one team</h2>
        {steps}
      </div>
      <div>
        <span class="eyebrow">Where we work</span>
        <h2 class="h2" style="margin-top:.8rem">Nashville and all of Middle Tennessee</h2>
        <p class="lead" style="margin:.8rem 0 1.2rem">Davidson, Williamson, Rutherford, Sumner and Wilson counties and the towns around them — every home within about 90 miles of Gallatin.</p>
        <div class="area-chips" data-reveal>{chips}</div>
      </div>
    </div>
  </div>
</section>

<section class="section section--fog section--tight">
  <div class="wrap">
    <span class="eyebrow">What customers say</span>
    <h2 class="h2" style="margin:.8rem 0 1.4rem">Five stars, in their words</h2>
    <div class="reviews-grid">{reviews}</div>
    <p style="margin-top:1.4rem"><a class="btn btn--ghost" href="/reviews">Read all our Google reviews <span class="arr">→</span></a></p>
  </div>
</section>

<section class="section" id="faq">
  <div class="wrap">
    <div style="max-width:820px;margin:0 auto">
      <span class="eyebrow">Common questions</span>
      <h2 class="h2" style="margin:1rem 0 1.2rem">Good questions, straight answers</h2>
      <div class="faq">{faq_items}</div>
      <p style="margin-top:1.2rem"><a class="btn btn--ghost" href="/faq">See all 38 questions <span class="arr">→</span></a></p>
    </div>
  </div>
</section>
''' + CONSULT
    SITE = 'https://nationalclosetco.com'
    schemas = [
      {"@context": "https://schema.org", "@type": "AboutPage", "@id": SITE + "/about#about", "url": SITE + "/about", "name": "About National Closet Company",
       "description": desc, "mainEntity": {"@id": SITE + "/#org"}, "isPartOf": {"@id": SITE + "/#website"}, "primaryImageOfPage": SITE + "/img/ncc-truck-og.jpg"},
      {"@context": "https://schema.org", "@type": "Organization", "@id": SITE + "/#org", "name": "National Closet Company", "alternateName": "National Closet Co.", "url": SITE + "/",
       "foundingDate": "2012", "telephone": "+1-629-298-8241", "email": "hello@nationalclosetco.com",
       "parentOrganization": PARENT_ORG,
       "founder": {"@id": SITE + "/#founder"},
       "employee": [{"@id": SITE + "/#founder"}, {"@id": SITE + "/#noah-blair"}],
       "knowsAbout": ["Custom closets", "Custom cabinets", "Custom pantries", "Garage storage", "Home offices", "Kitchen cabinets"]},
      {"@context": "https://schema.org", "@type": "Person", "@id": SITE + "/#founder", "name": "Michael Blair", "jobTitle": "Founder & Co-Owner", "worksFor": {"@id": SITE + "/#org"}, "url": SITE + "/about#michael-blair",
       "knowsAbout": ["Custom closets", "Custom cabinets", "Walk-in closet design", "Home storage systems"]},
      {"@context": "https://schema.org", "@type": "Person", "@id": SITE + "/#noah-blair", "name": "Noah Blair", "jobTitle": "Co-Owner", "worksFor": {"@id": SITE + "/#org"}, "url": SITE + "/about#noah-blair",
       "knowsAbout": ["Custom cabinets", "Custom closets", "Cabinetry", "Interior remodeling"]},
      {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": strip_tags(a)}} for q, a in faq]},
      C.breadcrumb([('Home', SITE + '/'), ('About', SITE + '/about')]),
      C.webpage('about', 'About National Closet Company', desc, '/img/ncc-truck-og.jpg'),
    ]
    out = C.page('about', title, desc, '/img/ncc-truck-og.jpg', body, schemas)
    open('about.html', 'w', encoding='utf-8').write(out)
    print('rebuilt about.html', len(out))

def part3():
    import sys; sys.path.insert(0, 'tools/site-build')
    import chrome as C
    global CONSULT
    CONSULT = block(C.BODY, r'<section class="section section--fog" id="consult">').replace('Book your free Nashville design', 'Book your free in-home design').replace('to book your free Nashville design', 'to book your free in-home design')
    build_about_page(C)

if __name__ == '__main__':
    part3()
