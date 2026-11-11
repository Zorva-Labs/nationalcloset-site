/* The site assistant — search that is also the assistant (site-kit assistant).
 *
 * One script tag. It adds a "Search or ask" button (a floating pill, or it binds
 * to any element the site marks data-ask-open), a panel, and everything the
 * panel does: type and every page, heading, FAQ and glossary term on the site is
 * searched in the browser from /search-index.json — questions answer themselves
 * in the results — press Enter and the question goes to /api/ask, which answers
 * from the same pages and streams the reply back with the pages it cited. When
 * the assistant has taken a call-back request, the visitor sees the details and
 * sends them with one tap through the site's own form transport (its lead
 * endpoint, or FormSubmit from the browser), and the conversion is reported to
 * /traffic like any form. Nothing here runs until the panel is opened.
 *
 * Colors come from search-index.json (site.json → assistant.ui), so the same
 * file serves every site. Progressive: without JavaScript the site is unchanged.
 */
(function () {
  'use strict';
  if (!window.HTMLDialogElement || !window.fetch || !window.TextDecoder) return;

  var CSS = '.ask-fab{position:fixed;z-index:80;right:1rem;bottom:1rem;display:inline-flex;align-items:center;gap:.5rem;min-height:48px;padding:.75rem 1.15rem;border:0;border-radius:999px;background:var(--ask-accent);color:var(--ask-accent-ink);font:600 .95rem/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;box-shadow:0 12px 30px -10px rgba(0,0,0,.5);cursor:pointer}'
    + '.ask-fab.left{right:auto;left:1rem}.ask-fab:hover{filter:brightness(1.08)}.ask-fab svg{flex:none}'
    + '@media (max-width:40rem){.ask-fab{bottom:calc(1rem + env(safe-area-inset-bottom))}}'
    + 'dialog.ask{width:min(44rem,calc(100vw - 2rem));max-height:min(88vh,52rem);margin:auto;padding:0;border:0;border-radius:20px;background:#fff;color:#1a1a1a;box-shadow:0 40px 90px -20px rgba(0,0,0,.6);font:400 16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}'
    + 'dialog.ask::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(3px)}'
    + '.ask-in{display:flex;flex-direction:column;gap:.9rem;padding:1.25rem;max-height:inherit;overflow:auto;box-sizing:border-box}.ask-in>*{flex-shrink:0}.ask [hidden]{display:none!important}'
    + '.ask-top{display:flex;align-items:center;justify-content:space-between;gap:1rem}.ask-tick{margin:0;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;font-weight:700;color:var(--ask-accent)}'
    + '.ask-close{border:0;background:transparent;color:#666;font-size:1.6rem;line-height:1;cursor:pointer;padding:.2rem .5rem;border-radius:8px}.ask-close:hover{background:#eee;color:#111}'
    + '.ask-form{display:flex;gap:.5rem}.ask-form input{flex:1 1 auto;min-width:0;min-height:46px;padding:.7rem 1rem;font:inherit;font-size:1rem;background:#fff;color:#111;border:1.5px solid #cfcfcf;border-radius:999px}.ask-form input:focus{border-color:var(--ask-accent);outline:2px solid var(--ask-accent);outline-offset:1px}'
    + '.ask-form input::-webkit-search-cancel-button{-webkit-appearance:none}'
    + '.ask-go,.ask-send{flex:none;min-height:46px;padding:.6rem 1.2rem;border:0;border-radius:999px;background:var(--ask-accent);color:var(--ask-accent-ink);font:700 .95rem/1 inherit;cursor:pointer}.ask-go:disabled{opacity:.6;cursor:default}'
    + '.ask-hint{margin:0;font-size:.85rem;color:#666}.ask-chips{display:flex;flex-wrap:wrap;gap:.4rem}.ask-chip{border:1px solid #d5d5d5;background:#fff;color:#222;font:600 .86rem/1.2 inherit;padding:.45rem .85rem;border-radius:999px;cursor:pointer}.ask-chip:hover{border-color:var(--ask-accent)}'
    + '.ask-results{list-style:none;margin:0;padding:0;border:1px solid #e3e3e3;border-radius:14px;background:#fff;overflow:hidden}.ask-results li+li{border-top:1px solid #e3e3e3}'
    + '.ask-results a,.ask-faq-q{display:grid;grid-template-columns:auto 1fr;gap:.15rem .7rem;width:100%;padding:.7rem .9rem;text-align:left;text-decoration:none;color:#111;border:0;background:transparent;font:inherit;cursor:pointer;box-sizing:border-box}.ask-results a:hover,.ask-faq-q:hover,.ask-faq.open .ask-faq-q{background:#f3f3f3}'
    + '.ask-kind{grid-row:span 2;align-self:start;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ask-accent);background:#f1f1f1;padding:.25rem .45rem;border-radius:6px;margin-top:.15rem;white-space:nowrap;font-weight:700}'
    + '.ask-title{font-weight:700;line-height:1.3}.ask-sub{font-size:.86rem;color:#666;line-height:1.4}.ask-none{padding:.8rem .9rem;font-size:.9rem;color:#666}'
    + '.ask-faq-q .ask-title::after{content:" ▾";color:var(--ask-accent);font-size:.85em}.ask-faq.open .ask-faq-q .ask-title::after{content:" ▴"}'
    + '.ask-faq-a{padding:.2rem .9rem .9rem calc(.9rem + 4.4rem);font-size:.93rem;color:#333;background:#fafafa;border-top:1px solid #e3e3e3}.ask-faq-a p{margin:.5rem 0 .4rem}.ask-faq-a a{color:var(--ask-accent);font-weight:600}@media (max-width:40rem){.ask-faq-a{padding-left:.9rem}}'
    + '.ask-thread{display:flex;flex-direction:column;gap:.7rem}.ask-thread:empty{display:none}'
    + '.ask-msg{max-width:92%;padding:.8rem 1rem;border-radius:16px;font-size:.98rem}.ask-msg p{margin:0}.ask-msg p+p,.ask-msg ul{margin-top:.55rem}.ask-msg ul{padding-left:1.2rem}.ask-msg li+li{margin-top:.3rem}'
    + '.ask-user{align-self:flex-end;background:var(--ask-accent);color:var(--ask-accent-ink);border-bottom-right-radius:4px}'
    + '.ask-assistant{align-self:flex-start;background:#fff;border:1px solid #e3e3e3;border-left:4px solid var(--ask-accent);border-bottom-left-radius:4px;color:#111}.ask-assistant a{color:var(--ask-accent);font-weight:600}'
    + '.ask-cite{display:inline-block;min-width:1.15em;padding:0 .3em;margin-left:.15em;border-radius:6px;background:#f1f1f1;color:var(--ask-accent);font-size:.72em;font-weight:700;text-decoration:none;vertical-align:super;line-height:1.5}'
    + '.ask-sources{font-size:.84rem;color:#666;border-top:1px solid #e3e3e3;padding-top:.5rem}.ask-wait{color:#666;font-style:italic}'
    + '.ask-lead{align-self:stretch;max-width:100%;border:1.5px solid var(--ask-accent);background:#fafafa;border-radius:16px;padding:.9rem 1rem}.ask-lead h4{margin:0 0 .4rem;font-size:.95rem}.ask-lead dl{margin:0 0 .7rem;display:grid;grid-template-columns:auto 1fr;gap:.2rem .8rem;font-size:.92rem}.ask-lead dt{color:#666}.ask-lead dd{margin:0}.ask-lead .ask-row{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}.ask-lead .ask-note{font-size:.82rem;color:#666;margin:.4rem 0 0}'
    + '.ask-ways{display:flex;flex-wrap:wrap;gap:.5rem;margin:.7rem 0 0}.ask-way{display:inline-flex;align-items:center;gap:.4rem;min-height:40px;padding:.5rem .9rem;border:1.5px solid var(--ask-accent);border-radius:999px;color:var(--ask-accent);font:600 .88rem/1 inherit;text-decoration:none;background:#fff}.ask-way:hover{background:var(--ask-accent);color:var(--ask-accent-ink)}'
    + '.ask-way-call{background:var(--ask-accent);color:var(--ask-accent-ink)}.ask-way-call:hover{filter:brightness(1.08)}'
    + '.ask-foot{margin:0;border-top:1px solid #e3e3e3;padding-top:.8rem}.ask-foot .ask-ways{margin:0}.ask-foot-note{margin:.5rem 0 0;font-size:.8rem;color:#666}'
    + '.ask-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}'
    + '.ask-nudge{position:fixed;z-index:81;right:1rem;bottom:4.75rem;width:min(19rem,calc(100vw - 2rem));box-sizing:border-box;padding:1rem 1rem .95rem;border:1px solid #e3e3e3;border-radius:16px;background:#fff;color:#1a1a1a;box-shadow:0 18px 40px -12px rgba(0,0,0,.45);font:400 15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;animation:ask-pop .25s ease-out}'
    + '.ask-nudge.left{right:auto;left:1rem}.ask-nudge.nofab{bottom:1rem}.ask-nudge p{margin:0 2.25rem .8rem 0}.ask-nudge strong{display:block;margin-bottom:.2rem;font-size:1.02rem;color:#111}'
    + '.ask-nudge-x{position:absolute;top:.3rem;right:.3rem;width:44px;height:44px;border:0;border-radius:10px;background:transparent;color:#555;font-size:1.45rem;line-height:1;cursor:pointer}.ask-nudge-x:hover{background:#f1f1f1;color:#111}'
    + '.ask-nudge-go{min-height:44px;padding:.6rem 1.15rem;border:0;border-radius:999px;background:var(--ask-accent);color:var(--ask-accent-ink);font:700 .95rem/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;cursor:pointer}.ask-nudge-go:hover{filter:brightness(1.08)}'
    + '@keyframes ask-pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.ask-nudge{animation:none}}'
    + '@media (max-width:40rem){.ask-nudge{bottom:calc(4.75rem + env(safe-area-inset-bottom))}.ask-nudge.nofab{bottom:calc(1rem + env(safe-area-inset-bottom))}}@media print{.ask-fab,.ask-nudge{display:none}}';
  /* What the page needs before the index loads — the colors, the name, the nudge — written in by the
     index step at build time (scripts/assistant-index.mjs); null in the source. */
  var BOOT = /*ask-boot*/null/*ask-boot*/;
  var ICON = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14"/></svg>';
  var KIND = { page: 'Page', faq: 'Question', term: 'Term' };

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s || '').toLowerCase().replace(/[’']/g, ''); }
  var STOP = { a: 1, an: 1, the: 1, and: 1, or: 1, of: 1, to: 1, in: 1, on: 1, for: 1, is: 1, are: 1, do: 1, does: 1, did: 1, my: 1, your: 1, you: 1, we: 1, it: 1, its: 1, this: 1, that: 1, with: 1, what: 1, how: 1, can: 1, i: 1, be: 1, me: 1, us: 1, our: 1, at: 1, by: 1, from: 1, as: 1, if: 1, not: 1, so: 1, there: 1, here: 1, about: 1, will: 1, would: 1, should: 1, could: 1, when: 1, where: 1, why: 1, who: 1, which: 1, any: 1, all: 1, some: 1, have: 1, has: 1, was: 1, were: 1, been: 1, they: 1, them: 1, than: 1, then: 1 };
  var SYN = { website: ['site', 'web'], site: ['website'], cost: ['price', 'pricing', 'fee', 'estimate'], price: ['cost', 'pricing', 'estimate'], pricing: ['cost', 'price'], quote: ['estimate', 'price'], estimate: ['quote', 'price'], long: ['week', 'day', 'month', 'timeline', 'quickly'], take: ['week', 'day', 'timeline'], fast: ['quickly', 'week', 'day'], phone: ['call', 'contact'], hour: ['open', 'hours', 'time'], insured: ['insurance', 'licensed'], licensed: ['license', 'insured'], warranty: ['guarantee'], area: ['serve', 'county', 'city'], serve: ['area', 'county'], near: ['area', 'serve'], emergency: ['urgent', 'same-day', 'today'], review: ['rating'] };
  function words(s) {
    return norm(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter(function (w) { return w.length > 1 && !STOP[w]; })
      .map(function (w) { return w.length > 4 && /ies$/.test(w) ? w.slice(0, -3) + 'y' : w.length > 3 && /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w; });
  }
  function isQuestion(s) { return /^(how|what|when|where|why|who|which|can|do|does|is|are|will|should|could|would)\b/.test(norm(s).trim()) || /\?\s*$/.test(s); }

  /* ---- mount ---- */
  var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  var dlg = document.createElement('dialog'); dlg.className = 'ask'; dlg.id = 'ask'; dlg.setAttribute('aria-labelledby', 'ask-title');
  dlg.innerHTML = '<div class="ask-in"><div class="ask-top"><p class="ask-tick" id="ask-title">Search the site · Ask ' + esc((BOOT && BOOT.persona) || 'the assistant') + '</p><button class="ask-close" type="button" aria-label="Close" data-ask-close>×</button></div>'
    + '<form class="ask-form" id="ask-form" autocomplete="off"><label class="ask-sr" for="ask-q">Search the site or ask a question</label><input id="ask-q" type="search" name="q" placeholder="Search the site, or ask a question…" maxlength="400" enterkeyhint="send"><button class="ask-go" type="submit" id="ask-go">Ask</button></form>'
    + '<p class="ask-hint" id="ask-hint">Type to search every page, or press Enter to ask me. I answer from what this site says and pass anything else to a person.</p>'
    + '<div class="ask-chips" id="ask-chips"></div><ol class="ask-results" id="ask-results" hidden aria-label="Search results"></ol><div class="ask-thread" id="ask-thread" aria-live="polite"></div>'
    + '<div class="ask-foot" id="ask-foot"></div></div>';
  document.body.appendChild(dlg);
  var box = dlg.querySelector('.ask-in'), form = dlg.querySelector('#ask-form'), input = dlg.querySelector('#ask-q'), go = dlg.querySelector('#ask-go');
  var results = dlg.querySelector('#ask-results'), thread = dlg.querySelector('#ask-thread'), chips = dlg.querySelector('#ask-chips'), foot = dlg.querySelector('#ask-foot');
  var openers = document.querySelectorAll('[data-ask-open]');
  var fab = null;
  if (!openers.length) {
    fab = document.createElement('button'); fab.type = 'button'; fab.className = 'ask-fab'; fab.setAttribute('data-ask-open', ''); fab.setAttribute('aria-haspopup', 'dialog'); fab.setAttribute('aria-controls', 'ask');
    fab.innerHTML = ICON + '<span>Search or ask</span>'; document.body.appendChild(fab); openers = [fab];
  }
  function paint(ui) {
    ui = ui || {};
    document.documentElement.style.setProperty('--ask-accent', ui.accent || '#1a1a1a');
    document.documentElement.style.setProperty('--ask-accent-ink', ui.accentInk || '#fff');
    if (fab) { if (ui.label) fab.querySelector('span').textContent = ui.label; if (ui.position === 'left') fab.classList.add('left'); }
  }
  paint(BOOT && BOOT.ui);

  var index = null, loading = null, lastFocus = null, busy = false, cfg = {};
  var session = null;
  try { session = sessionStorage.getItem('ask_session'); if (!session) { session = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); sessionStorage.setItem('ask_session', session); } } catch (e) {}
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem('ask_thread') || '[]'); } catch (e) { history = []; }
  function saveHistory() { try { sessionStorage.setItem('ask_thread', JSON.stringify(history.slice(-6))); } catch (e) {} }
  function toEnd() { box.scrollTop = box.scrollHeight; }
  function report(name, detail) {
    try { if (navigator.sendBeacon) navigator.sendBeacon('/api/pv-event', new Blob([JSON.stringify({ n: name, p: location.pathname, d: detail || 'assistant' })], { type: 'application/json' })); } catch (e) {}
  }

  /* ---- open / close ---- */
  function open(prefill) {
    lastFocus = document.activeElement;
    try { sessionStorage.setItem('ask_opened', '1'); } catch (e) {}
    hideNudge();
    if (!dlg.open) dlg.showModal();
    if (prefill) input.value = prefill;
    input.focus();
    if (history.length && !thread.childElementCount) renderHistory();
    load();
    search(input.value);
  }
  /* The visitor never has to click back into the box (Michael, 2026-11-09: "make sure the user doesnt have to
     keep clicking in the box to respond"): the box is never disabled, tapping Ask or a suggested question does
     not take the focus from it (so a phone's keyboard stays up), and the focus comes back after every answer
     and after the call-back card is sent — unless the visitor has moved on to a link or another field. */
  function keepTyping() {
    if (!dlg.open) return;
    var a = document.activeElement;
    if (a && a !== document.body && a !== input && !dlg.contains(a)) return;
    if (a && a !== input && /^(A|INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
    try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); }
  }
  function close() { if (dlg.open) dlg.close(); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  Array.prototype.forEach.call(openers, function (b) { b.addEventListener('click', function () { open(''); }); });
  dlg.querySelector('[data-ask-close]').addEventListener('click', close);
  dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); });
  document.addEventListener('keydown', function (e) {
    var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); dlg.open ? close() : open(''); return; }
    if (e.key === '/' && !typing && !dlg.open) { e.preventDefault(); open(''); }
  });

  /* ---- the nudge (Michael, 2026-11-09): a small card asking whether the visitor has any questions,
     a few seconds after they start scrolling. Once a visit; "No thanks" holds for a week; never on a
     contact, quote or thank-you page, never while the panel is open or a form field has focus, and
     not at all once the panel has been opened this visit. site.json → assistant.nudge: title, text,
     button, delay (ms after the first scroll, 3000), scroll (px, 150), off. ---- */
  var nudgeEl = null;
  function hideNudge() { if (nudgeEl) { nudgeEl.remove(); nudgeEl = null; } }
  (function () {
    var N = (BOOT && BOOT.nudge) || {};
    if (N.off || /\/(contact|get-a-quote|quote|estimate|thank-you|thanks|traffic)/.test(location.pathname)) return;
    function get(k, local) { try { return (local ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } }
    function set(k, v, local) { try { (local ? localStorage : sessionStorage).setItem(k, v); } catch (e) {} }
    if (get('ask_nudged') || get('ask_opened') || Number(get('ask_nudge_no', true) || 0) > Date.now()) return;
    var delay = N.delay != null ? N.delay : 3000, need = N.scroll != null ? N.scroll : 150, tries = 0;
    function onScroll() {
      if ((window.pageYOffset || document.documentElement.scrollTop || 0) < need) return;
      window.removeEventListener('scroll', onScroll);
      setTimeout(show, delay);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    function show() {
      if (get('ask_nudged') || get('ask_opened')) return;
      var a = document.activeElement;
      if (dlg.open || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) { if (++tries < 4) setTimeout(show, 5000); return; }
      set('ask_nudged', '1');
      var name = (BOOT && BOOT.name) || 'us';
      nudgeEl = document.createElement('div');
      nudgeEl.className = 'ask-nudge' + (fab ? (fab.classList.contains('left') ? ' left' : '') : ' nofab');
      nudgeEl.setAttribute('data-chat-nudge', ''); nudgeEl.setAttribute('role', 'dialog'); nudgeEl.setAttribute('aria-labelledby', 'ask-nudge-t'); nudgeEl.setAttribute('aria-live', 'polite');
      nudgeEl.innerHTML = '<button type="button" class="ask-nudge-x" aria-label="No thanks" data-nudge-no>×</button>'
        + '<p><strong id="ask-nudge-t">' + esc(N.title || (BOOT && BOOT.persona ? 'Hi, I’m ' + BOOT.persona + '. Any questions?' : 'Have any questions?')) + '</strong>' + esc(N.text || 'I’m happy to help. Ask me anything about ' + name + '.') + '</p>'
        + '<button type="button" class="ask-nudge-go" data-nudge-go>' + esc(N.button || 'Ask a question') + '</button>';
      document.body.appendChild(nudgeEl);
      nudgeEl.querySelector('[data-nudge-go]').addEventListener('click', function () { open(''); });
      nudgeEl.querySelector('[data-nudge-no]').addEventListener('click', function () { set('ask_nudge_no', String(Date.now() + 7 * 864e5), true); hideNudge(); });
      nudgeEl.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideNudge(); });
      setTimeout(hideNudge, 45000);
    }
  })();

  /* ---- the index and the site's configuration ---- */
  function load() {
    if (index || loading) return loading;
    loading = fetch('/search-index.json', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (j) {
      index = j; cfg = j;
      paint(j.ui);
      index.pages.forEach(function (p) { p._t = norm(p.t); p._d = norm(p.d); p._h = (p.h || []).map(norm); p._q = (p.q || []).map(function (f) { return norm(f.q); }); p._a = (p.q || []).map(function (f) { return norm(f.a); }); });
      (index.terms || []).forEach(function (t) { t._t = norm(t.t); t._d = norm(t.d); });
      chips.innerHTML = (j.suggested || []).map(function (q) { return '<button type="button" class="ask-chip" data-ask-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
      foot.innerHTML = ways() + '<p class="ask-foot-note">I’m the site’s assistant, not a person. These buttons reach the team.</p>';
      search(input.value);
    }).catch(function () { loading = null; });
    return loading;
  }

  /* ---- search as you type ---- */
  function search(q) {
    var ws = words(q);
    if (!index || !ws.length) { results.hidden = true; results.innerHTML = ''; chips.hidden = !!ws.length; return; }
    chips.hidden = true;
    var phrase = ws.join(' '), question = isQuestion(q), RX = {};
    ws.forEach(function (w) { RX[w] = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); (SYN[w] || []).forEach(function (a) { RX[a] = RX[a] || new RegExp('\\b' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 's?\\b'); }); });
    function has(text, w) { if (RX[w].test(text)) return true; var alt = SYN[w]; if (alt) for (var k = 0; k < alt.length; k++) if (RX[alt[k]].test(text)) return true; return false; }
    function score(text, weight) {
      var hit = 0; for (var i = 0; i < ws.length; i++) if (has(text, ws[i])) hit++;
      if (!hit) return 0;
      var cover = hit / ws.length, sc = weight * hit * (0.35 + 0.65 * cover * cover);
      if (ws.length > 1 && text.indexOf(phrase) >= 0) sc *= 1.6;
      if (question && weight >= 4) sc *= 1.25;
      return sc;
    }
    var hits = [];
    index.pages.forEach(function (p) {
      var best = null, sT = score(p._t, 5), sD = score(p._d, 1.5);
      if (sT || sD) best = { s: sT + sD, title: p.t, sub: p.d, url: p.u, kind: 'page' };
      p._h.forEach(function (h, i) { var sc = score(h, 3); if (sc && (!best || sc + 1 > best.s)) best = { s: sc + 1, title: p.t, sub: p.h[i], url: p.u, kind: 'page' }; });
      if (best) hits.push(best);
      p._q.forEach(function (qq, i) { var sc = score(qq, 4) + score(p._a[i], 0.6); if (sc) hits.push({ s: sc + 1.5, title: p.q[i].q, sub: p.t, url: p.u + (p.q[i].id ? '#' + p.q[i].id : ''), kind: 'faq', answer: p.q[i].a }); });
    });
    (index.terms || []).forEach(function (t) { var sc = score(t._t, 6) + score(t._d, 1); if (sc) hits.push({ s: sc + 0.5, title: t.t, sub: t.d, url: t.u, kind: 'term', answer: t.d }); });
    hits.sort(function (a, b) { return b.s - a.s; });
    var seen = {}, kept = [];
    hits.forEach(function (h) { var key = h.kind + '|' + norm(h.title); if (seen[key]) { if (h.url.split('#')[0] === location.pathname) kept[seen[key] - 1] = h; return; } seen[key] = kept.push(h); });
    hits = kept.slice(0, 8);
    if (!hits.length) { results.hidden = false; results.innerHTML = '<li class="ask-none">Nothing on the site matches that word for word. Press Enter and I’ll answer from the pages.</li>'; return; }
    var openFirst = question && hits[0].answer;
    results.hidden = false;
    results.innerHTML = hits.map(function (h, i) {
      if (h.answer) {
        var op = openFirst && i === 0;
        return '<li class="ask-faq' + (op ? ' open' : '') + '"><button type="button" class="ask-faq-q" aria-expanded="' + op + '"><span class="ask-kind">' + esc(KIND[h.kind] || 'Page') + '</span><span class="ask-title">' + esc(h.title) + '</span><span class="ask-sub">' + esc(h.sub) + '</span></button>'
          + '<div class="ask-faq-a"' + (op ? '' : ' hidden') + '><p>' + esc(h.answer) + '</p><a href="' + esc(h.url) + '">Read it on the page →</a></div></li>';
      }
      return '<li><a href="' + esc(h.url) + '"><span class="ask-kind">' + esc(KIND[h.kind] || 'Page') + '</span><span class="ask-title">' + esc(h.title) + '</span><span class="ask-sub">' + esc(String(h.sub || '').slice(0, 140)) + '</span></a></li>';
    }).join('');
  }
  var timer = null;
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { search(input.value); }, 60); });
  results.addEventListener('click', function (e) {
    var b = e.target.closest('.ask-faq-q');
    if (b) { var li = b.parentNode, a = li.querySelector('.ask-faq-a'), op = !li.classList.contains('open'); li.classList.toggle('open', op); a.hidden = !op; b.setAttribute('aria-expanded', String(op)); return; }
    var link = e.target.closest('a');
    if (link && link.getAttribute('href').split('#')[0] === location.pathname) { close(); setTimeout(openHash, 50); }
  });
  function openHash() {
    var id = location.hash.slice(1); if (!id) return;
    var d = document.getElementById(id);
    if (d && d.tagName === 'DETAILS') { d.open = true; d.scrollIntoView({ block: 'start' }); }
  }
  window.addEventListener('hashchange', openHash);
  openHash();

  /* ---- the thread ---- */
  function bubble(role, html, cls) { var el = document.createElement('div'); el.className = 'ask-msg ask-' + role + (cls ? ' ' + cls : ''); el.innerHTML = html; thread.appendChild(el); return el; }
  function renderHistory() { history.forEach(function (m) { if (m.role === 'user') bubble('user', esc(m.content)); else { bubble('assistant', md(m.content, m.sources || [])); if (m.lead) leadCard(m.lead, m.sent); } }); toEnd(); }
  function md(text, sources) {
    var s = esc(text);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    var origin = (cfg.origin || location.origin).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp('https?://[^\\s)<]*?' + location.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(/[^\\s)<]*)?', 'g'), function (m, p) { var path = p || '/'; return '<a href="' + esc(path) + '">' + esc(path.replace(/\/$/, '') || 'the home page') + '</a>'; });
    s = s.replace(/(^|[^"'>])(https?:\/\/[^\s)<]+)/g, function (m, pre, url) { return pre + '<a href="' + esc(url) + '" rel="noopener">' + esc(url.replace(/^https?:\/\//, '')) + '</a>'; });
    s = s.replace(/\[(\d{1,2})\]/g, function (m, n) { var src = null; for (var i = 0; i < sources.length; i++) if (String(sources[i].n) === n) src = sources[i]; return src ? '<a class="ask-cite" href="' + esc(src.url) + '" title="' + esc(src.title) + '">' + n + '</a>' : '<span class="ask-cite">' + n + '</span>'; });
    var lines = s.split(/\n+/), out = '', list = [];
    function flush() { if (list.length) { out += '<ul>' + list.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>'; list = []; } }
    lines.forEach(function (l) { var m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/); if (m) list.push(m[1]); else { flush(); if (l.trim()) out += '<p>' + l + '</p>'; } });
    flush();
    if (sources.length) out += '<p class="ask-sources">Read more: ' + sources.map(function (x) { return '<a href="' + esc(x.url) + '">' + esc(x.title) + (x.heading ? ' — ' + esc(x.heading) : '') + '</a>'; }).join(' · ') + '</p>';
    return out;
  }
  /* the ways to reach a person, under an answer that asked for them */
  /* the calls to action, once, at the foot of the panel — a call, the form, a booking link (Michael, 2026-09-20: not under every answer) */
  function ways() {
    var h = cfg.handoff || {}, out = [];
    if (h.phone) out.push('<a class="ask-way ask-way-call" href="' + esc(h.phoneHref) + '" data-ask-way="call">' + esc(h.callLabel || 'Call ' + h.phone) + '</a>');
    if (h.form) out.push('<a class="ask-way" href="' + esc(h.form) + '" data-ask-way="form">' + esc(h.formLabel || 'Send a message') + '</a>');
    if (h.booking) out.push('<a class="ask-way" href="' + esc(h.booking) + '" rel="noopener" data-ask-way="book">' + esc(h.bookingLabel || 'Book online') + '</a>');
    return out.length ? '<div class="ask-ways">' + out.join('') + '</div>' : '';
  }
  thread.addEventListener('click', function (e) { var a = e.target.closest('[data-ask-way]'); if (a) report(a.getAttribute('data-ask-way') === 'call' ? 'call' : a.getAttribute('data-ask-way') === 'form' ? 'form_submit' : 'directions', 'assistant'); });
  foot.addEventListener('click', function (e) { var a = e.target.closest('[data-ask-way]'); if (a) report(a.getAttribute('data-ask-way') === 'call' ? 'call' : a.getAttribute('data-ask-way') === 'form' ? 'form_submit' : 'directions', 'assistant'); });

  /* ---- the call-back card: the visitor confirms, the browser sends it the way the contact form does ---- */
  var openedAt = Date.now();
  function leadCard(lead, sent) {
    var el = document.createElement('div'); el.className = 'ask-msg ask-lead';
    var rows = [['Name', lead.name], ['Phone', lead.phone], ['Email', lead.email], ['Need', lead.need], ['Where', lead.city], ['When', lead.timing]].filter(function (r) { return r[1]; });
    el.innerHTML = '<h4>' + (sent ? 'Sent to ' : 'Send this to ') + esc(cfg.name || (BOOT && BOOT.name) || 'the business') + (sent ? '' : '?') + '</h4><dl>' + rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>'
      + (sent ? '<p class="ask-note">Thanks. They’ll call you back soon.' + ((cfg.handoff || {}).phone ? ' If it’s urgent, <a href="' + esc(cfg.handoff.phoneHref) + '" data-ask-way="call">call ' + esc(cfg.handoff.phone) + '</a>.' : '') + '</p>'
        : '<div class="ask-row"><button type="button" class="ask-send">Send it</button><span class="ask-note">Nothing is sent until you tap.</span></div>');
    thread.appendChild(el); toEnd();
    if (!sent) el.querySelector('.ask-send').addEventListener('click', function () { sendLead(lead, el); });
    return el;
  }
  /* A saved call-back is a lead: the site's own tracking takes it from the cancelable
     window event 'ask:lead' (detail: name, phone, email, city, need) and calls
     preventDefault() so it is counted once, its own way (its Ads label, Meta, enhanced
     data). With no listener the kit fires GA4 generate_lead itself. */
  function leadSaved(lead) {
    var ev; try { ev = new CustomEvent('ask:lead', { cancelable: true, detail: { name: lead.name || '', phone: lead.phone || '', email: lead.email || '', city: lead.city || '', need: lead.need || '', source: 'assistant' } }); } catch (e) { return; }
    if (window.dispatchEvent(ev) && typeof window.gtag === 'function') { try { window.gtag('event', 'generate_lead', { form_location: 'assistant' }); } catch (e) {} }
  }

  function sendLead(lead, el) {
    var btn = el.querySelector('.ask-send'); btn.disabled = true; btn.textContent = 'Sending…';
    var L = cfg.lead || {}, parts = String(lead.name || '').trim().split(/\s+/);
    var fields = { 'First Name': parts[0] || lead.name, 'Last Name': parts.slice(1).join(' '), Phone: lead.phone, Email: lead.email || '', City: lead.city || '', 'Project Type': '', Message: lead.need + (lead.timing ? ' — when: ' + lead.timing : ''), page: location.pathname, hp_ms: String(Date.now() - openedAt), zq7x: '', Source: 'Site assistant' };
    var req;
    if (L.transport === 'api' && L.endpoint) req = fetch(L.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fields), redirect: 'follow' });
    else if (L.transport === 'formsubmit' && L.endpoint) req = fetch(L.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ name: lead.name, phone: lead.phone, email: lead.email || '', city: lead.city || '', message: fields.Message, _subject: 'Call-back request from the website assistant', _template: 'table', source: 'Site assistant' }) });
    else req = Promise.reject(new Error('no transport'));
    report('form_submit', 'assistant');
    // Only a real save counts (rulebook 41): the kit's /api/lead answers a bot drop with 200 and
    // { ok: true }, and success:true only for a saved row, so the api transport reads the body.
    req.then(function (r) { if (!r.ok && r.type !== 'opaqueredirect') throw new Error('HTTP ' + r.status); return r; }).then(function (r) {
      if (L.transport !== 'api') return r;
      return r.json().then(function (j) { if (!j || j.success !== true) throw new Error('not saved'); return r; });
    }).then(function () {
      report('form_complete', 'assistant');
      leadSaved(lead);
      for (var i = history.length - 1; i >= 0; i--) if (history[i].lead) { history[i].sent = true; break; }
      saveHistory();
      el.remove(); leadCard(lead, true); keepTyping();
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Send it';
      var h = cfg.handoff || {};
      el.querySelector('.ask-note').innerHTML = 'Sorry, that didn’t go through. ' + (h.phone ? 'Please <a href="' + esc(h.phoneHref) + '" data-ask-way="call">call ' + esc(h.phone) + '</a>' : '') + (h.form ? (h.phone ? ' or ' : 'Please ') + 'use <a href="' + esc(h.form) + '">the contact page</a>' : '') + '.';
    });
  }

  /* ---- ask ---- */
  function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; go.disabled = true;
    results.hidden = true; results.innerHTML = ''; chips.hidden = true; input.value = '';
    bubble('user', esc(q));
    var el = bubble('assistant', '<p class="ask-wait">One moment…</p>');
    toEnd();
    var text = '', sources = [], lead = null;
    var sent = history.slice(-6).map(function (m) { return { role: m.role, content: m.content }; });
    fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: q, history: sent, page: location.pathname, session: session }) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('HTTP ' + r.status)); }, function () { throw new Error('HTTP ' + r.status); });
        var reader = r.body.getReader(), dec = new TextDecoder(), buf = '';
        function handle(line) {
          if (!line.trim()) return;
          var j; try { j = JSON.parse(line); } catch (e) { return; }
          if (j.d) { text += j.d; el.innerHTML = md(text, []); }
          if (j.lead) lead = j.lead;
          if (j.error) throw new Error(j.error);
          if (j.done) { sources = j.sources || []; el.innerHTML = md(text, sources); }
          toEnd();
        }
        function pump() { return reader.read().then(function (x) { if (x.done) { handle(buf); return; } buf += dec.decode(x.value, { stream: true }); var i; while ((i = buf.indexOf('\n')) >= 0) { handle(buf.slice(0, i)); buf = buf.slice(i + 1); } return pump(); }); }
        return pump();
      })
      .then(function () {
        history.push({ role: 'user', content: q }, { role: 'assistant', content: text, sources: sources, lead: lead });
        saveHistory();
        if (lead) leadCard(lead, false);
      })
      .catch(function (e) {
        el.innerHTML = '<p>' + esc(!e.message || /^HTTP \d/.test(e.message) || /fetch|network/i.test(e.message) ? 'Sorry, something went wrong on my end. Please try again in a moment.' : e.message) + '</p>';
      })
      .then(function () { busy = false; go.disabled = false; keepTyping(); });
  }
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  /* a tap on Ask or a chip keeps the focus (and the phone's keyboard) in the box */
  function holdFocus(e) { if (e.target.closest('.ask-go, .ask-chip')) e.preventDefault(); }
  form.addEventListener('pointerdown', holdFocus); chips.addEventListener('pointerdown', holdFocus);
  chips.addEventListener('click', function (e) { var b = e.target.closest('[data-ask-q]'); if (b) ask(b.getAttribute('data-ask-q')); });
})();
