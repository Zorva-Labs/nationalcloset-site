import re, os, sys, html
sys.path.insert(0, os.path.dirname(__file__))
from chrome import *
os.chdir(ROOT)

# ---------------- blog index: photos instead of clipped share cards, filters, real projects first
p = 'closet-cases.html'; s = open(p, encoding='utf-8').read(); o = s
IMG = {'best-closet-company': '/img/insp-walkin-3.webp', 'closet-installation-cost': '/img/build-floor-based.webp', 'contractor-cost-to-build-a-closet': '/img/insp-reachin-4.webp',
       'custom-pantry-design': '/img/insp-pantry-2.webp', 'home-depot-lowes-closet-installation': '/img/insp-reachin-6.webp', 'what-closet-company-does-costco-use': '/img/insp-walkin-4.webp',
       'california-closets-cost': '/img/blog-custom-closet-cost.webp', 'california-closets-vs-local': '/img/blog-closet-systems-compared.webp', 'closet-organization-ideas': '/img/blog-closet-organization-after.webp',
       'fraley-pantry-master-closet-makeover': '/img/blog-fraley-closet.webp', 'keith-irena-office-storage-wall': '/img/blog-office-storage-after.webp', 'garage-storage-systems-guide': '/img/svc-garage.webp',
       'maximize-small-reach-in-closet': '/img/svc-reachin.webp', 'walk-in-closet-design-ideas': '/img/svc-walkin.webp', 'wall-mounted-vs-floor-based-closet-systems': '/img/build-wall-mounted.webp',
       'see-your-closet-in-3d': '/img/blog-3d-design-result.webp', 'large-walk-in-closet-6700': '/img/blog-large-walkin.webp'}
REAL = {'fraley-pantry-master-closet-makeover', 'keith-irena-office-storage-wall', 'large-walk-in-closet-6700'}
def cat(slug, tag):
    t = tag.lower()
    if slug in REAL: return 'real'
    if 'pric' in t or 'cost' in t or 'cost' in slug or 'discount' in slug: return 'pricing'
    if 'process' in t or slug in ('see-your-closet-in-3d', 'wall-mounted-vs-floor-based-closet-systems', 'closet-systems-compared', 'floor-based-closet-systems', 'rail-closet-systems', 'modular-closet-systems'): return 'process'
    if 'guide' in t or 'buyer' in t or 'compan' in slug or 'vs' in slug: return 'guide'
    return 'ideas'
cards = re.findall(r'<a class="post-card" href="/blog/([^"]+)"[^>]*>.*?</a>', s, re.S)
full = re.findall(r'<a class="post-card" href="/blog/[^"]+"[^>]*>.*?</a>', s, re.S)
assert len(full) == 29, len(full)
new_cards = []; swapped = 0
for card in full:
    slug = re.search(r'href="/blog/([^"]+)"', card).group(1)
    tag = (re.search(r'<span class="tag">(.*?)</span>', card) or [None, ''])[1]
    c = cat(slug, tag)
    img = IMG.get(slug) or (f'/img/blog-{slug}.webp' if os.path.exists(f'img/blog-{slug}.webp') else None)
    nc = card
    m = re.search(r'<img src="([^"]+)"', nc)
    if img and m and m.group(1) != img and os.path.exists(img.lstrip('/')): nc = nc.replace(m.group(1), img, 1); swapped += 1
    nc = nc.replace('<a class="post-card"', f'<a class="post-card" data-cat="{c}"', 1)
    if c == 'real': nc = nc.replace(f'<span class="tag">{tag}</span>', '<span class="tag">Real project</span>')
    new_cards.append((0 if c == 'real' else 1, nc))
new_cards.sort(key=lambda x: x[0])
grid = block(s, r'<div class="post-grid"[^>]*>')
open_tag = re.match(r'<div class="post-grid"[^>]*>', grid).group(0)
new_open = open_tag if 'id=' in open_tag else open_tag.replace('<div class="post-grid"', '<div class="post-grid" id="post-grid"')
new_grid = new_open + '\n' + '\n'.join(c for _, c in new_cards) + '\n</div>'
FIL = [('all', 'All'), ('real', 'Real projects'), ('pricing', 'Pricing'), ('guide', "Buyer's guides"), ('process', 'How we build'), ('ideas', 'Design ideas')]
bar = '<div class="filters" data-filters="#post-grid" role="group" aria-label="Filter posts">' + ''.join('<button type="button" data-filter="' + v + '"' + (' class="on"' if v == 'all' else '') + '>' + l + '</button>' for v, l in FIL) + '</div>'
s = s.replace(grid, bar + '\n' + new_grid)
assert s != o; open(p, 'w', encoding='utf-8').write(s)
print(f'closet-cases: {swapped} card images swapped to photos, {sum(1 for k,_ in new_cards if k==0)} real projects first, filters added')

# ---------------- competitor pages: comparison table, real photos, real reviews
photos = '''<div class="pair" style="margin:1.6rem 0">
  <figure><img src="/img/blog-fraley-closet.webp" alt="The Fraleys' custom master walk-in closet, a real National Closet Company install" loading="lazy" /><figcaption><b>A real install:</b> the Fraleys' master closet. <a href="/blog/fraley-pantry-master-closet-makeover" style="color:var(--clay-deep);font-weight:700">See the before &amp; after →</a></figcaption></figure>
  <figure><img src="/img/blog-large-walkin.webp" alt="Large custom walk-in closet installed for $6,700" loading="lazy" /><figcaption><b>$6,700 installed</b> where national brands quoted $12,000 to $17,000. <a href="/blog/large-walk-in-closet-6700" style="color:var(--clay-deep);font-weight:700">See the numbers →</a></figcaption></figure>
</div>'''
revs = '<div class="reviews-grid" style="margin:1.6rem 0">' + review_card(REVIEWS[1], 230) + review_card(REVIEWS[2], 230) + '</div><p style="margin-bottom:2rem">' + rating_badge() + ' &nbsp; <a href="/reviews" style="color:var(--clay-deep);font-weight:700">Read all reviews →</a></p>'
done = 0
for f in sorted(x for x in os.listdir('.') if x.endswith('-alternative.html')):
    s = open(f, encoding='utf-8').read(); o = s
    if 'class="cmp"' in s or 'reviews-grid' in s: continue
    local_rival = f.startswith('the-closet-company')
    block_html = ('' if local_rival else compare_table()) + photos + revs
    prose = block(s, r'<div class="prose">')
    h2s = [m.start() for m in re.finditer(r'<h2', prose)]
    cut = h2s[1] if len(h2s) > 1 else prose.rfind('</div>')
    new_prose = prose[:cut] + block_html + '\n' + prose[cut:]
    s = s.replace(prose, new_prose, 1)
    assert s != o; open(f, 'w', encoding='utf-8').write(s); done += 1
print('competitor pages updated:', done)

# ---------------- pricing page: estimator + a lead form to land on
p = 'custom-closet-cost-nashville.html'; s = open(p, encoding='utf-8').read(); o = s
if 'data-estimator' not in s:
    secs = list(re.finditer(r'<section[^>]*>.*?</section>', s, re.S))
    guide = secs[1]
    est_sec = f'''
<section class="section section--fog section--tight" id="estimate">
  <div class="wrap">
    <span class="eyebrow">Ballpark in ten seconds</span>
    <h2 class="h2" style="margin-top:.8rem">Estimate your closet</h2>
    <p class="lead">Pick the space, size and finish for a typical installed range. Your designer confirms the exact price, free, at your in-home design.</p>
    <div style="margin-top:1.2rem">{estimator()}</div>
    <p style="margin-top:1.4rem">{rating_badge()}</p>
  </div>
</section>
'''
    consult = block(BODY, r'<section class="section section--fog" id="consult">').replace('Book your free Nashville design', 'Get your exact price, free').replace('to book your free Nashville design', 'to book your free in-home design')
    s = s[:guide.end()] + est_sec + s[guide.end():]
    if 'id="consult"' not in s:
        last = list(re.finditer(r'<section[^>]*>.*?</section>', s, re.S))[-1]
        s = s[:last.end()] + '\n' + consult + s[last.end():]
    assert s != o; open(p, 'w', encoding='utf-8').write(s); print('pricing page: estimator + consult form added')
