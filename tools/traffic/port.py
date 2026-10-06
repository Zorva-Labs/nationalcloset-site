#!/usr/bin/env python3
"""Build crm/traffic.html from traffic-kit's tabbed dashboard.

    python3 tools/traffic/port.py            # writes crm/traffic.html
    python3 tools/traffic/port.py --check    # says whether crm/traffic.html is current

The page is the kit's (~/traffic-kit/template/public/traffic/index.html) with
National Closet's edits laid over it, each found by an anchor that has to be
there exactly as often as expected, so a kit change that moves one stops the
port instead of silently dropping it. After a kit update: run this, read the
diff, look at /crm/traffic in the browser, deploy.

The edits, in order:
  - the brand: the name, the icon, Montserrat, the bar's colors;
  - the sign-in is the CRM's (/api/auth/me, /crm/login.html, /api/auth/logout),
    and the bar links back to the CRM;
  - a Tennessee switch beside the ranges (?tn=1 on the data and ads requests);
  - the Edge tab as this site logs it: the engagement beacon's visits, the
    website's forms from `leads`, no taps to call, no crawlers, no devices (the
    states take their card and their tile).
The endpoints are functions/api/traffic/*.js (docs/traffic.md).
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
KIT = os.path.expanduser("~/traffic-kit/template/public/traffic/index.html")
OUT = os.path.join(ROOT, "crm", "traffic.html")

page = open(KIT, encoding="utf-8").read()


def sub(old, new, count=1):
    global page
    n = page.count(old)
    if n != count:
        sys.exit(f"port: expected {count} of {old[:90]!r}, found {n} — the kit's page changed; update tools/traffic/port.py")
    page = page.replace(old, new)


def between(start, end, new):
    """Replace from `start` up to (not including) `end`."""
    global page
    a = page.find(start)
    b = page.find(end, a + len(start)) if a >= 0 else -1
    if a < 0 or b < 0 or page.count(start) != 1:
        sys.exit(f"port: could not find {start[:70]!r} … {end[:40]!r} once — update tools/traffic/port.py")
    page = page[:a] + new + page[b:]


NAME = "National Closet Company"

# ---- the brand ------------------------------------------------------------------
sub("__SITE_NAME__", NAME, 2)
sub("__LOGO_HEADER__", f"<strong>{NAME}</strong>")
sub("__LOGO_LOGIN__", f"<strong>{NAME}</strong>")
between('<link rel="icon" href="/favicon.svg"', "<!-- /brand: icons -->",
        '<link rel="icon" href="/img/favicon-nc.png" type="image/png">\n')
sub("<!-- /brand: fonts -->",
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap">\n'
    "<!-- /brand: fonts -->")
sub("""  --bar:#101828; --bar-ink:#ffffff; --bar-muted:#c6cbd4;
  --brand:#2a78d6;
  --font-display:var(--font-ui); --display-weight:760;""",
    """  --bar:#16140f; --bar-ink:#ffffff; --bar-muted:#d6d0c6;
  --brand:#b9542f;
  --font-display:'Montserrat',var(--font-ui); --display-weight:800;""")
sub('<meta name="theme-color" content="#101828">', '<meta name="theme-color" content="#16140f">')

# ---- the CRM's sign-in ------------------------------------------------------------
sub('<span class="top__sp"></span>',
    '<span class="top__sp"></span>\n'
    '      <a class="top__btn" href="/crm/"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg><span class="top__t">CRM</span></a>')
between("async function session() {", "function showLogin(configured) {",
        """async function session() {
  /* The CRM's session: this page sits behind the CRM sign-in, not a password of its own. */
  try {
    const r = await fetch('/api/auth/me', { headers: { accept: 'application/json' }, credentials: 'same-origin' });
    return { signedIn: r.ok, configured: true };
  } catch { return { signedIn: false, configured: true }; }
}
""")
between("function showLogin(configured) {", "$('signout').addEventListener",
        """function showLogin() {
  location.href = '/crm/login.html?next=' + encodeURIComponent(location.pathname + location.search + location.hash);
}
""")
sub("$('signout').addEventListener('click', async () => { await fetch('/api/traffic/auth', { method: 'DELETE' }).catch(() => {}); location.reload(); });",
    "$('signout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {}); location.href = '/crm/login.html'; });")
between("<!-- Sign in ---", "<!-- Dashboard ---", "")
sub("""  if (!s.signedIn) { showLogin(s.configured); return; }
  $('app').hidden = false;
  $('login').hidden = true;""",
    """  if (!s.signedIn) { showLogin(); return; }
  $('app').hidden = false;""")

# ---- Tennessee only ---------------------------------------------------------------
sub('<div class="ranges" id="ranges" role="group" aria-label="Date range"></div>',
    '<div class="mast__ctl"><div class="ranges" id="area" role="group" aria-label="Where the visitors are">'
    '<button type="button" data-tn="0">All visitors</button><button type="button" data-tn="1">Tennessee</button></div>'
    '<div class="ranges" id="ranges" role="group" aria-label="Date range"></div></div>')
sub(".ranges button[aria-pressed=\"true\"]{background:var(--ink);color:#fff}",
    ".ranges button[aria-pressed=\"true\"]{background:var(--ink);color:#fff}\n"
    ".mast__ctl{display:flex;gap:8px;flex-wrap:wrap;align-items:center}")
sub("  data: null, bing: undefined, ads: undefined,",
    "  data: null, bing: undefined, ads: undefined,\n"
    "  /* Tennessee only: the visitors who can buy (Cloudflare's region). */\n"
    "  tn: params.get('tn') === '1',")
sub("""function buildRanges() {
  $('ranges').innerHTML""",
    """function buildArea() {
  for (const b of $('area').querySelectorAll('[data-tn]')) b.setAttribute('aria-pressed', String((b.dataset.tn === '1') === S.tn));
}
const pageUrl = () => `${location.pathname}?days=${S.days}${S.tn ? '&tn=1' : ''}#${S.tab}`;
$('area').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-tn]');
  if (!b || (b.dataset.tn === '1') === S.tn) return;
  S.tn = b.dataset.tn === '1';
  buildArea();
  history.replaceState(null, '', pageUrl());
  load();
});
function buildRanges() {
  $('ranges').innerHTML""")
sub("  if (push) history.replaceState(null, '', `${location.pathname}?days=${S.days}#${id}`);",
    "  if (push) history.replaceState(null, '', `${location.pathname}?days=${S.days}${S.tn ? '&tn=1' : ''}#${id}`);")
sub("  history.replaceState(null, '', `${location.pathname}?days=${S.days}#${S.tab}`);\n  load();",
    "  history.replaceState(null, '', pageUrl());\n  load();")
sub("  buildRanges();\n  const s = await session();", "  buildRanges();\n  buildArea();\n  const s = await session();")
sub("get(`/api/traffic/data?days=${S.days}`)", "get(`/api/traffic/data?days=${S.days}${S.tn ? '&tn=1' : ''}`)")
sub("get(`/api/traffic/ads?days=${S.days}`)", "get(`/api/traffic/ads?days=${S.days}${S.tn ? '&tn=1' : ''}`)")
sub("$('sub').innerHTML = `<b>${esc(dRange(S.start, S.today))}</b> · the last ${rangeLabel()} · updated",
    "$('sub').innerHTML = `<b>${esc(dRange(S.start, S.today))}</b> · the last ${rangeLabel()}${S.tn ? ' · Tennessee only' : ''} · updated")

# ---- the Edge tab, as this site logs it ---------------------------------------------
sub("""<h2 class="hero__title">Every visit, counted at the door.</h2>
        <p class="hero__lede">The site logs each visit itself, at Cloudflare&rsquo;s edge, before any script runs &mdash; so ad blockers, cookie banners and privacy settings can&rsquo;t hide anyone. <b>This is the number to quote.</b></p>""",
    """<h2 class="hero__title">Every visit by a real person, counted by the site itself.</h2>
        <p class="hero__lede">The site counts each page a visitor actually opens, with its own first-party beacon on its own address &mdash; nothing for an ad blocker to recognize, and no crawler or script, because only a real browser sends it. The forms are the ones saved in the CRM. <b>This is the number to quote.</b></p>""")
# Visits: no tap-to-call log on this site, so a lead is a form.
sub("A dot marks a day that brought a call or a completed form.", "A dot marks a day that brought a form.")
sub("and how many of them turned into a call or a form.", "and how many of them sent a form.")
sub("""<h3>Calls and forms</h3><p class="card__help">Every tap on the phone number and every form that reached the thank-you page, newest first &mdash; who sent each form, where the person came from, and what they did first.</p>""",
    """<h3>Forms</h3><p class="card__help">Every form sent from the website, newest first, as saved in the CRM &mdash; who sent it, what they asked about, where they came from and the page their visit began on. Calls to the number aren&rsquo;t logged on this site.</p>""")
sub("<p class=\"card__help\">Calls and completed forms by hour of day, in the site&rsquo;s local time. Worth knowing for when the phone needs answering.</p>",
    "<p class=\"card__help\">Forms by hour of day, Central time.</p>")
sub("<p class=\"card__help\">Calls are credited to the page the person was on, forms to the page their visit started on &mdash; with the Google search each page ranks for best. This is where budget belongs.</p>",
    "<p class=\"card__help\">Each form is credited to the page the visit started on &mdash; with the Google search each page ranks for best. This is where budget belongs.</p>")
sub("""    kpi({ label: 'Calls and forms', value: fmt.int(leads), d: delta(leads, conv.previous, { vs }), series: leadsS.some(Boolean) ? leadsS : null,
      sub: `${fmt.plural(calls, 'call')} · ${fmt.plural(forms, 'form')}` }),
    kpi({ label: 'Visits that got in touch', value: fmt.pct(rate), d: deltaPts(rate, pRate), sub: 'calls and forms per visit' }),""",
    """    kpi({ label: 'Forms', value: fmt.int(leads), d: delta(leads, conv.previous, { vs }), series: leadsS.some(Boolean) ? leadsS : null,
      sub: 'sent from the website' }),
    kpi({ label: 'Visits that sent a form', value: fmt.pct(rate), d: deltaPts(rate, pRate), sub: 'forms per visit' }),""")
sub("""    kpi({ label: 'On a phone', value: devTotal ? fmt.pct(mobile / devTotal) : '—', sub: devTotal ? `${fmt.int(mobile)} of ${fmt.int(devTotal)} pages` : 'no device data yet' }),""",
    """    kpi({ label: 'From Tennessee', value: visits ? fmt.pct((T.tn_entries || 0) / visits) : '—', sub: visits ? `${fmt.int(T.tn_entries || 0)} of ${fmt.int(visits)} visits` : 'no visits yet' }),""")
sub("leads ? { icon: 'phone', html: `<b>${fmt.plural(leads, 'call or form', 'calls and forms')}</b>, from ${fmt.pct(rate)} of visits.",
    "leads ? { icon: 'form', html: `<b>${fmt.plural(leads, 'form')}</b>, from ${fmt.pct(rate)} of visits.")
sub("{ icon: 'phone', html: 'No calls or completed forms in this window yet. Each one will appear under <b>Calls and forms</b> with the source that brought it.' }",
    "{ icon: 'form', html: 'No forms in this window yet. Each one will appear under <b>Forms</b> with the source that brought it.' }")
sub("empty('No calls or forms in this window yet, so there is no pattern to show.')", "empty('No forms in this window yet, so there is no pattern to show.')")
sub("label: vals[i] === 1 ? 'call or form' : 'calls and forms' }] }),\n        aria: 'Calls and forms by hour of day' });",
    "label: vals[i] === 1 ? 'form' : 'forms' }] }),\n        aria: 'Forms by hour of day' });")
sub("empty: 'No calls or forms yet, so no page to credit.'", "empty: 'No forms yet, so no page to credit.'")
sub("{ h: 'Calls &amp; forms', n: 1, f: (r) => (r.l ? `<b>${fmt.int(r.l)}</b>` : '—') }", "{ h: 'Forms', n: 1, f: (r) => (r.l ? `<b>${fmt.int(r.l)}</b>` : '—') }")
sub("'<span><i class=\"d\" style=\"background:var(--s-orange)\"></i>A call or form that day</span>'",
    "'<span><i class=\"d\" style=\"background:var(--s-orange)\"></i>A form that day</span>'")
sub("label: leadsS[i] === 1 ? 'call or form' : 'calls and forms' }] : [])] }) });",
    "label: leadsS[i] === 1 ? 'form' : 'forms' }] : [])] }) });")
sub("{ h: 'Rate', n: 1, title: 'Calls and forms per visit',", "{ h: 'Rate', n: 1, title: 'Forms per visit',")
between("  const minis = `<div class=\"minis\">", "  const cap = 6;",
        """  const minis = '';
  if (!rows.length) {
    box.innerHTML = empty('No form sent from the website in this window yet.');
    return;
  }
""")
between("function formHealth(byName, hasThankYou) {", "function renderEdgeBots(cr) {",
        """function formHealth(byName) {
  const done = byName.form_complete || 0;
  return done ? `${icon('check')} ${fmt.plural(done, 'form')}, each saved in the CRM before its email went out, so none was lost on the way.` : '';
}

""")
sub("in the last ${rangeLabel()}. The log starts the day the dashboard went live, so there is no earlier period to compare yet.` }",
    "in the last ${rangeLabel()}. The beacon has recorded where each visit came from since September 13, 2026, so there is no earlier period to compare yet.` }")
# Devices → the states; no crawler card (the middleware drops bots unlogged).
sub("""<h3>Phone or computer</h3><p class="card__help">What people browsed on. Most people looking for a local business are on a phone.</p>""",
    """<h3>Which state</h3><p class="card__help">Where in the US each visit came from. Tennessee is the only state the business works in.</p>""")
sub("""  guard('edge-devices', () => {
    const parts = (fp.devices || []).map((x) => ({ label: cap1(x.device), value: x.n, color: DEVICE_COLOR[x.device] || 'var(--s-gray)' }));
    $('edge-devices').innerHTML = devTotal ? donut(parts, fmt.pct(mobile / devTotal), 'on a phone') : empty('No device data yet.');
  });""",
    """  guard('edge-devices', () => {
    const rows = (fp.regions || []).map((x) => ({ label: STATES[x.region] || x.region, value: x.n, tn: x.region === 'TN' }));
    $('edge-devices').innerHTML = barList(rows, { label: (r) => (r.tn ? `<b>${esc(r.label)}</b>` : esc(r.label)), value: (r) => r.value, sub: (r) => fmt.pct(r.value / (visits || 1)), empty: 'No visits yet.' });
  });""")
sub("const DEVICE_COLOR = {",
    "const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'Washington, DC', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };\n"
    "const DEVICE_COLOR = {")
between('        <article class="card span-8" id="card-bots">', '        <article class="card span-4" id="card-time">', "")
sub('<article class="card span-6" id="card-refs">', '<article class="card span-4" id="card-refs">')
sub('<article class="card span-6" id="card-countries">', '<article class="card span-4" id="card-countries">')
sub("  guard('edge-bots', () => renderEdgeBots(d.crawlers || {}));\n", "")

# Analytics counts every visitor, so its "seen by Google's tag" compares with
# every visit the site logged, whatever the Tennessee switch says.
sub("  const edgeVisits = S.data?.firstParty?.totals?.entries || 0;",
    "  const edgeVisits = S.data?.firstParty?.totals?.all_entries ?? S.data?.firstParty?.totals?.entries ?? 0;")

# The Google Ads tab: the site's half is forms (no tap-to-call log), and the
# account is ours to read, not one we review weekly for a client.
sub("The calls and forms come from the site’s own log, tied to the ad click that brought each person",
    "The forms come from the site’s own log, tied to the ad click that brought each person")
sub("The site logged <b>${fmt.plural(siteLeads, 'call or form', 'calls and forms')}</b> from people who came from an ad.",
    "The site logged <b>${fmt.plural(siteLeads, 'form')}</b> from people who came from an ad.")
sub(" with no lead yet. We review these every week and block the ones that will never buy.` } : null,",
    " with no lead yet.` } : null,")
sub("<p class=\"card__help\">Calls and forms on the site from people whose visit started with an ad click, from the site’s own log.</p>",
    "<p class=\"card__help\">Forms sent from the site by people whose visit started with an ad click, from the site’s own log.</p>")
sub("from the site’s own log, with the calls and forms that followed.", "from the site’s own log, with the forms that followed.")
sub("<li>The site counts a call or a form from anyone whose visit began with an ad click, on the day ",
    "<li>The site counts a form from anyone whose visit began with an ad click, on the day ")
sub("{ label: 'Called or sent a form', value: siteLeads, note: 'on the site' },", "{ label: 'Sent a form', value: siteLeads, note: 'on the site' },")
sub("empty(`No call or form on the site from an ad visitor in this window yet.", "empty(`No form on the site from an ad visitor in this window yet.")

banner = ("<!-- Built from traffic-kit's tabbed dashboard by tools/traffic/port.py — edit that\n"
          "     script (or the kit's template), never this file by hand. -->\n")
page = page.replace("<html lang=\"en\">\n", "<html lang=\"en\">\n" + banner, 1)

if "--check" in sys.argv:
    cur = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
    print("crm/traffic.html is current" if cur == page else "crm/traffic.html differs from the port: run tools/traffic/port.py")
    sys.exit(0 if cur == page else 1)
open(OUT, "w", encoding="utf-8").write(page)
print(f"wrote {os.path.relpath(OUT, ROOT)} ({len(page):,} bytes)")
