/* The assistant's index — built from dist/ after every build.
 *
 * Reads every public page the site just built and writes two files beside them:
 *
 *   dist/search-index.json     what the browser searches as you type: every
 *                              page's title, description and headings, every
 *                              FAQ with its answer (so a question chosen from
 *                              the results is answered on the spot)
 *   dist/assistant-index.json  what /api/ask answers from: every chunk of text
 *                              on every page (a heading and the copy under it),
 *                              every FAQ, a fact sheet about the business read
 *                              from the home page's own structured data, and
 *                              the configuration the panel and the Function
 *                              share (where a caller is handed off, how a lead
 *                              is sent, the caps, the accent color)
 *
 * Nothing here is hand-written: the assistant can only ever say what the site
 * says, and the site's own JSON-LD is the record of who the business is.
 * Configuration that a human sets lives in site.json under "assistant" —
 * see site-kit's README. Installed by `site-kit assistant`; run by the last
 * line of build.mjs. Node builtins only.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const MAX_CHUNK = 900;

/* ---- html → text ------------------------------------------------------------------------------------------ */
const decode = (s) => String(s || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const text = (html) => decode(String(html || '')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<form[\s\S]*?<\/form>/gi, ' ').replace(/<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<template[\s\S]*?<\/template>/gi, ' ')
  .replace(/<summary>/gi, '\n').replace(/<\/summary>/gi, ': ')
  .replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|div|li|tr|h[1-6]|dt|dd|blockquote|section|article|ul|ol|table|figcaption|details)>/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
const attr = (tag, name) => (String(tag).match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i')) || [])[1];
const slug = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70);

function pieces(t) {
  const out = []; let cur = '';
  for (const sent of t.split(/(?<=[.!?])\s+|\n/)) {
    if (!sent) continue;
    if ((cur + ' ' + sent).length > MAX_CHUNK && cur) { out.push(cur.trim()); cur = sent; } else cur = cur ? cur + ' ' + sent : sent;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* the main content of a page: <main> when there is one, else the body without header/footer/nav */
function mainOf(html) {
  const m = html.match(/<main\b[\s\S]*?<\/main>/i);
  if (m) return m[0];
  const b = (html.match(/<body\b[\s\S]*?<\/body>/i) || [html])[0];
  return b.replace(/<header\b[\s\S]*?<\/header>/gi, ' ').replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ');
}
function sections(html) {
  const re = /<h([123])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const out = []; let last = 0, heading = ''; let m;
  while ((m = re.exec(html))) {
    const before = html.slice(last, m.index);
    if (before.trim()) out.push({ heading, text: text(before) });
    heading = text(m[2]); last = m.index + m[0].length;
  }
  const tail = html.slice(last);
  if (tail.trim()) out.push({ heading, text: text(tail) });
  return out.filter((s) => s.text && s.text.length > 40);
}
/* FAQs: the FAQPage schema when the page carries one (exact text), else <details><summary> pairs */
function faqsOf(html, ld) {
  const out = [];
  for (const node of ld) if (node['@type'] === 'FAQPage') for (const q of node.mainEntity || []) { const a = q.acceptedAnswer?.text; if (q.name && a) out.push({ q: decode(q.name), a: decode(a) }); }
  if (out.length) return out;
  for (const m of html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi)) {
    const s = m[2].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (!s) continue;
    const q = text(s[1]), a = text(m[2].replace(s[0], ''));
    if (q && a && a.length > 20) out.push({ q, a, id: attr(m[1], 'id') || undefined });
  }
  return out;
}
/* ids on the page for the FAQ details, when the site gives them one */
function faqIds(html) {
  const ids = new Map();
  for (const m of html.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/gi)) {
    const id = attr(m[1], 'id'); const s = m[2].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i);
    if (id && s) ids.set(text(s[1]), id);
  }
  return ids;
}
function ldOf(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { const j = JSON.parse(m[1]); const nodes = Array.isArray(j) ? j : j['@graph'] ? j['@graph'] : [j]; out.push(...nodes); } catch {}
  }
  return out;
}

/* ---- the business, from the home page's own structured data ----------------------------------------------- */
const BUSINESS = /Organization|LocalBusiness|Business|Contractor|Plumber|Electrician|Dentist|Attorney|Store|Service|Clinic|Agent|Restaurant|Company/;
function businessOf(ld) {
  const typeOf = (n) => [].concat(n['@type'] || []).join(' ');
  return ld.find((n) => /LocalBusiness/.test(typeOf(n))) || ld.find((n) => BUSINESS.test(typeOf(n)) && n.name && (n.telephone || n.address || n.email)) || ld.find((n) => /Organization/.test(typeOf(n))) || null;
}
const hoursText = (spec) => [].concat(spec || []).map((h) => `${[].concat(h.dayOfWeek || []).map((d) => String(d).replace(/^.*\//, '').slice(0, 3)).join(', ')} ${h.opens}–${h.closes}`).join('; ');
const areaText = (a) => [...new Set([].concat(a || []).map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean))].join(', ');
function factSheet(biz, cfg, pagesList) {
  const lines = [];
  if (biz) {
    const addr = biz.address && typeof biz.address === 'object' ? [biz.address.streetAddress, biz.address.addressLocality, biz.address.addressRegion, biz.address.postalCode].filter(Boolean).join(', ') : '';
    lines.push(`${biz.name} (${cfg.origin.replace(/^https?:\/\//, '')})${biz.description ? ` — ${biz.description}` : ''}`);
    if (biz.telephone) lines.push(`Phone: ${biz.telephone}. Calling is the fastest way to reach the business.`);
    if (biz.email) lines.push(`Email: ${biz.email}.`);
    if (addr) lines.push(`Address: ${addr}.`);
    if (biz.openingHoursSpecification) lines.push(`Hours: ${hoursText(biz.openingHoursSpecification)}.`);
    if (biz.areaServed) lines.push(`Service area: ${areaText(biz.areaServed)}.`);
    if (biz.foundingDate) lines.push(`Founded: ${biz.foundingDate}.`);
    if (biz.priceRange) lines.push(`Price range as the business states it: ${biz.priceRange}.`);
    if ([].concat(biz.sameAs || []).length) lines.push(`Profiles: ${[].concat(biz.sameAs).join(', ')}.`);
  }
  const services = pagesList.filter((p) => /^\/services\//.test(p.u) && p.u !== '/services/').map((p) => p.t);
  if (services.length) lines.push(`Service pages: ${services.join('; ')}.`);
  const areas = pagesList.filter((p) => /^\/(service-)?areas?\//.test(p.u) && !/^\/(service-)?areas?\/$/.test(p.u)).map((p) => p.t);
  if (areas.length) lines.push(`Area pages: ${areas.join('; ')}.`);
  lines.push(`Contact page: ${cfg.origin}${cfg.handoff.form || '/contact/'}.`);
  if (cfg.handoff.booking) lines.push(`Online booking: ${cfg.handoff.booking}.`);
  for (const f of cfg.facts || []) lines.push(String(f));
  return lines.join('\n');
}

/* ---- main ---------------------------------------------------------------------------------------------------- */
const site = fs.existsSync(path.join(ROOT, 'site.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8')) : {};
const A = site.assistant || {};
if (A.enabled === false) { console.log('  assistant: disabled in site.json'); process.exit(0); }
if (!fs.existsSync(DIST)) { console.error('assistant-index: no dist/'); process.exit(1); }

const walk = (d, base = '') => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), path.posix.join(base, e.name)) : [path.posix.join(base, e.name)]));
const allHtml = walk(DIST).filter((f) => f.endsWith('.html'));

const files = allHtml.filter((f) => !/^(traffic|crm|projects)\//.test(f) && !/^(404|thank-you)/.test(f) && !/^google[0-9a-f]{12,}\.html$/i.test(f));

const pagesList = [], chunks = [], seen = new Map();
let home = null;
for (const rel of files.sort()) {
  const html = fs.readFileSync(path.join(DIST, rel), 'utf8');
  if (/<meta name="robots"[^>]*noindex/i.test(html)) continue;
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/i) || [])[1];
  let url; try { url = canonical ? new URL(canonical).pathname : null; } catch { url = null; }
  if (!url) url = '/' + rel.replace(/index\.html$/, '').replace(/\.html$/, '/');
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s*[|—–-]\s*[^|—–-]*$/, '').trim() || url;
  const description = decode(attr((html.match(/<meta name="description"[^>]*>/i) || [''])[0], 'content') || '');
  const ld = ldOf(html);
  if (url === '/') home = { html, ld };
  const main = mainOf(html);
  const secs = sections(main);
  const ids = faqIds(html);
  const faqs = faqsOf(main, ld).map((f) => ({ ...f, id: f.id || ids.get(f.q) || undefined }));
  pagesList.push({ u: url, t: title, d: description, h: [...new Set(secs.map((s) => s.heading).filter(Boolean))].slice(0, 14), q: faqs.map((f) => ({ q: f.q, a: f.a, id: f.id })) });
  const push = (chunk) => { const key = chunk.x.slice(0, 200); if (seen.has(key)) return; seen.set(key, url); chunks.push(chunk); };
  for (const s of secs) for (const x of pieces(s.text)) push({ u: url, t: title, h: s.heading, x });
  for (const f of faqs) push({ u: f.id ? `${url}#${f.id}` : url, t: title, k: 'faq', h: f.q, x: f.a });
}

/* configuration: what the site knows about itself + what site.json says */
const biz = home ? businessOf(home.ld) : null;
const origin = (site.canonicalHost ? `https://${site.canonicalHost}` : biz?.url || '').replace(/\/$/, '') || '';
const themeColor = home ? attr((home.html.match(/<meta name="theme-color"[^>]*>/i) || [''])[0], 'content') : '';
const hasApi = fs.existsSync(path.join(ROOT, 'functions/api/lead.js'));
const contactHtml = files.find((f) => /^contact\//.test(f)) ? fs.readFileSync(path.join(DIST, files.find((f) => /^contact\//.test(f))), 'utf8') : '';
const formsubmitTo = (contactHtml.match(/formsubmit\.co\/(?:ajax\/)?([^"'\s]+)/) || [])[1] || null;
const transport = A.lead?.transport || (hasApi && /^d1/.test(site.forms?.transport || '') ? 'api' : formsubmitTo ? 'formsubmit' : 'link');
const lead = {
  transport,
  endpoint: A.lead?.endpoint || (transport === 'api' ? '/api/lead' : transport === 'formsubmit' ? `https://formsubmit.co/ajax/${formsubmitTo}` : null),
  emailRequired: A.lead?.emailRequired ?? transport === 'api',
};
const phone = A.handoff?.phone || biz?.telephone || '';
const cfg = {
  name: A.name || biz?.name || site.name || site.canonicalHost || 'this business',
  /* a name for the assistant itself ("Cloe"), when the site gives it one: the panel's title, the card's greeting, how it introduces itself */
  persona: A.persona || null,
  origin,
  model: A.model || 'claude-sonnet-5',
  caps: { visitor: A.caps?.visitor ?? 30, day: A.caps?.day ?? 400 },
  handoff: {
    phone: phone || null,
    phoneHref: phone ? 'tel:' + phone.replace(/[^\d+]/g, '') : null,
    form: A.handoff?.form || (files.some((f) => /^contact\//.test(f)) ? '/contact/' : null),
    booking: A.handoff?.booking || null,
    email: A.handoff?.email || biz?.email || null,
    /* the calls to action under every answer and at the foot of the panel */
    callLabel: A.handoff?.callLabel || (phone ? `Call ${phone}` : null),
    formLabel: A.handoff?.formLabel || 'Send a message',
    bookingLabel: A.handoff?.bookingLabel || 'Book online',
  },
  lead,
  ui: { accent: A.ui?.accent || themeColor || '#1A1919', accentInk: A.ui?.accentInk || '#FFFFFF', label: A.ui?.label || 'Search or ask', position: A.ui?.position || 'right' },
  suggested: A.suggested?.length ? A.suggested : pagesList.flatMap((p) => p.q.map((f) => f.q)).filter((q, i, arr) => arr.indexOf(q) === i).slice(0, 5),
  facts: A.facts || [],
  rules: A.rules || [],
  /* the "any questions?" card a few seconds after the visitor starts scrolling (Michael, 2026-11-09); { off: true } turns it off */
  nudge: { title: A.nudge?.title || null, text: A.nudge?.text || null, button: A.nudge?.button || null, delay: A.nudge?.delay ?? 3000, scroll: A.nudge?.scroll ?? 150, off: A.nudge?.off === true },
};
/* The widget: what it needs before the index loads (the colors, the name, the nudge) is written into it,
   then it carries a content hash like the site's own script does — it lives under /assets/, which every
   site serves immutable for a year — and every page points at the new name. */
{
  const plain = path.join(DIST, 'assets/js/assistant.js');
  if (fs.existsSync(plain)) {
    const boot = JSON.stringify({ name: cfg.name, persona: cfg.persona, ui: cfg.ui, nudge: cfg.nudge }).replace(/</g, '\\u003c');
    const src = fs.readFileSync(plain, 'utf8');
    if (!src.includes('/*ask-boot*/null/*ask-boot*/')) console.warn('  assistant: the widget has no boot slot — run site-kit assistant to update it');
    fs.writeFileSync(plain, src.replace('/*ask-boot*/null/*ask-boot*/', () => boot));
    const hash = crypto.createHash('sha256').update(fs.readFileSync(plain)).digest('hex').slice(0, 8);
    const hashed = `assets/js/assistant.${hash}.js`;
    fs.renameSync(plain, path.join(DIST, hashed));
    for (const rel of allHtml) {
      const file = path.join(DIST, rel), html = fs.readFileSync(file, 'utf8');
      const out = html.split('/assets/js/assistant.js').join('/' + hashed);
      if (out !== html) fs.writeFileSync(file, out);
    }
  }
}

const facts = factSheet(biz, cfg, pagesList);
const built = new Date().toISOString().slice(0, 10);

fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify({ built, ui: cfg.ui, suggested: cfg.suggested, handoff: cfg.handoff, lead: { transport: lead.transport, endpoint: lead.endpoint, emailRequired: lead.emailRequired }, name: cfg.name, pages: pagesList, terms: [] }));
fs.writeFileSync(path.join(DIST, 'assistant-index.json'), JSON.stringify({ built, config: cfg, facts, chunks }));
const kb = (f) => Math.round(fs.statSync(path.join(DIST, f)).size / 1024);
console.log(`  assistant: search-index.json (${pagesList.length} pages, ${kb('search-index.json')} KB) · assistant-index.json (${chunks.length} chunks, ${kb('assistant-index.json')} KB) · lead via ${lead.transport}${phone ? ` · phone ${phone}` : ''}`);
