/* Assemble dist/ from the files National Closet Co. actually serves.
 *
 *   node build.mjs && npx wrangler pages deploy dist --project-name=nationalcloset --branch=main --commit-dirty=true
 *
 * The site is hand-written at the repo root, and the root is never what gets
 * deployed: `wrangler pages deploy .` uploads everything except functions/,
 * node_modules and .git (reading _headers, _redirects and _routes.json on the
 * way), and `.assetsignore` is a Workers static-assets file Pages never reads —
 * so a root deploy put CLAUDE.md, CHANGELOG.md, site.json, wrangler.toml,
 * .indexnow.json, migrations/ and .claude/ on the public site (found
 * 2026-09-23; ~/fleet/docs/gotchas.md). This copies an allow-list instead:
 * every page at the root (the .html files, 404 and /traffic included), the
 * files and folders below, and inside those folders nothing that is for the
 * repo rather than a browser. A new public file at the root goes on the list —
 * the build names any file a page links to that it did not copy. Functions are
 * read from ./functions by wrangler whatever the output directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'dist');

const FILES = [
  ...fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')),
  'robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.ico', '_headers',
  /* The IndexNow key — a 32-hex .txt whose content is its name — served from the root. */
  ...fs.readdirSync(ROOT).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f)),
];
const DIRS = ['blog', 'book', 'contract', 'crm', 'css', 'estimate', 'fonts', 'img', 'invoice', 'js', 'proposal', 'thanks'];
const PRIVATE = (rel) => /(^|\/)\.|(^|\/)migrations\/|\.(md|sql|py|sh|log|toml|bak|orig)$/i.test(rel) || rel === 'crm/setup-admin.mjs';

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
let n = 0;
for (const f of FILES) {
  const from = path.join(ROOT, f);
  if (!fs.existsSync(from)) { console.error(`  missing: ${f}`); process.exit(1); }
  fs.copyFileSync(from, path.join(OUT, f));
  n++;
}
const copyDir = (rel) => {
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const r = `${rel}/${e.name}`;
    if (PRIVATE(e.isDirectory() ? `${r}/` : r)) continue;
    if (e.isDirectory()) { copyDir(r); continue; }
    fs.mkdirSync(path.join(OUT, rel), { recursive: true });
    fs.copyFileSync(path.join(ROOT, r), path.join(OUT, r));
    n++;
  }
};
for (const d of DIRS) copyDir(d);
console.log(`  dist/ built: ${n} files`);

/* Every local file a page, stylesheet or manifest names should be in dist/ —
   one left off the list is a broken page — so any that is not gets named.
   Function routes (the folders and files in functions/) are not files. */
const routes = fs.readdirSync(path.join(ROOT, 'functions')).filter((f) => !f.startsWith('_')).map((f) => '/' + f.replace(/\.[jt]s$/, ''));
const served = (p) => {
  const f = path.join(OUT, decodeURIComponent(p));
  if (p.endsWith('/')) return fs.existsSync(path.join(f, 'index.html'));
  return fs.existsSync(f) || fs.existsSync(`${f}.html`) || fs.existsSync(path.join(f, 'index.html'));
};
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const missing = new Set();
for (const file of walk(OUT).filter((f) => /\.(html|css|json|webmanifest)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const at = '/' + path.relative(OUT, path.dirname(file));
  const refs = [
    ...[...text.matchAll(/(?:href|src|poster)=["']([^"'#?]+)/gi)].map((m) => m[1]),
    ...[...text.matchAll(/url\(\s*["']?([^"')#?]+)/gi)].map((m) => m[1]),
    ...[...text.matchAll(/"src"\s*:\s*"([^"#?]+)"/g)].map((m) => m[1]),
    ...[...text.matchAll(/srcset=["']([^"']+)["']/gi)].flatMap((m) => m[1].split(',').map((s) => s.trim().split(/\s+/)[0].split(/[?#]/)[0])),
  ];
  for (let r of refs) {
    r = r.trim();
    /* %23 is an encoded #: a fragment inside an inline SVG data URI, not a file. */
    if (!r || /^[a-z][a-z0-9+.-]*:|^\/\/|^%23|[${}+<>\s]/i.test(r)) continue;
    const abs = r.startsWith('/') ? r : path.posix.join(at, r);
    if (abs.startsWith('/cdn-cgi/') || routes.some((p) => abs === p || abs.startsWith(`${p}/`))) continue;
    if (!served(abs)) missing.add(`${abs}  (${path.relative(OUT, file)})`);
  }
}
if (missing.size) {
  console.log(`  ! ${missing.size} file(s) a page names are not in dist/ — put them on the list above, or fix the link:`);
  for (const x of [...missing].slice(0, 25)) console.log(`      ${x}`);
}

/* The FAQPage schema is the page's visible FAQ: one list, never a second copy.
   On 2026-09-26 five pages' schema had drifted from what they show. /faq's was
   a third-person copy of its 38 answers, 32 of them no longer the page's, and
   it asked "Does National Closet Company have reviews?" over a visible "Do you
   have reviews I can read?"; the home page's answers had been rewritten on the
   page only; two posts' carried questions their FAQ never showed; and the
   pantry page's carried "&ldquo;custom&rdquo;" as text. So no page carries a
   FAQPage. Each page's visible FAQ is its list, and the FAQPage is written
   here, into dist/, from it, word for word:
   - the accordion (`.faq__item`: `button.faq__q` + `.faq__a-inner`, what
     tools/site-build/chrome.py's faq_item() writes), on the pages and most posts;
   - on a post without one, the `<p><strong>Question?</strong><br>Answer</p>`
     paragraphs under its "Frequently asked questions" heading.
   The build stops on a page that carries its own FAQPage, on an FAQ item it
   cannot read or an entity it cannot decode, and on an email address in an
   answer outside <!--email_off-->…<!--/email_off-->: Cloudflare's Email
   Address Obfuscation serves it as "[email protected]", so the live page would
   not say what its schema says. Edit the FAQ on the page. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…', prime: '′', Prime: '″', times: '×', rarr: '→', middot: '·' };
const plain = (html) => html
  .replace(/<\/?(?:p|br|li|ul|ol|div|h[1-6])\b[^>]*>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
  .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)))
  .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name] ?? m) /* case matters: &Prime; is ″, &prime; is ′ */
  .replace(/\s+/g, ' ').trim();
const ACCORDION = /<button class="faq__q"[^>]*>([\s\S]*?)<\/button>\s*<div class="faq__a"[^>]*>\s*<div class="faq__a-inner"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
const POST_FAQ = /<h2[^>]*>\s*Frequently asked questions\s*<\/h2>/i;
const POST_ITEM = /^\s*<p><strong>([\s\S]*?)<\/strong><br>([\s\S]*?)<\/p>/;
const EMAIL = /[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/;
const faqStops = [];
let faqPages = 0, faqQs = 0;
for (const file of walk(OUT).filter((f) => f.endsWith('.html'))) {
  const rel = path.relative(OUT, file);
  const stop = (why) => faqStops.push(`${rel}: ${why}`);
  let h = fs.readFileSync(file, 'utf8');
  if (/"@type"\s*:\s*(?:\[[^\]]*)?"FAQPage"/.test(h)) { stop("carries its own FAQPage — delete it; the build writes it from the page's FAQ"); continue; }
  const items = (h.match(/class="faq__item"/g) || []).length;
  const accordion = [...h.matchAll(ACCORDION)].map((m) => ({ q: m[1], a: m[2] }));
  if (accordion.length !== items) { stop(`${items} .faq__item, ${accordion.length} read as button.faq__q + .faq__a-inner`); continue; }
  const boxed = accordion.find((x) => /<div\b/i.test(x.a));
  if (boxed) { stop(`a <div> inside the answer to "${plain(boxed.q)}" — the answer ends at the first </div>, so the build cannot read it whole`); continue; }
  const list = [];
  const heading = h.match(POST_FAQ);
  if (heading) {
    let rest = h.slice(heading.index + heading[0].length), m;
    while ((m = rest.match(POST_ITEM))) { list.push({ q: m[1], a: m[2] }); rest = rest.slice(m[0].length); }
  }
  if (accordion.length && list.length) { stop('an accordion and a <p><strong> FAQ list — one FAQ per page'); continue; }
  if (heading && !accordion.length && !list.length) { stop('a "Frequently asked questions" heading with no accordion and no <p><strong>Question?</strong><br>Answer</p> under it'); continue; }
  const shown = accordion.length ? accordion : list;
  if (!shown.length) continue;
  const faq = [];
  for (const { q, a } of shown) {
    const x = { q: plain(q), a: plain(a) };
    if (!x.q || !x.a) { stop(`an FAQ item with no ${x.q ? `answer ("${x.q}")` : 'question'}`); break; }
    if (list.length && !x.q.endsWith('?')) { stop(`"${x.q}" under "Frequently asked questions" is not a question — only <p><strong>Question?</strong><br>Answer</p> paragraphs go there`); break; }
    if (/&[#a-z0-9]+;/i.test(x.q + x.a)) { stop(`an entity the build does not decode in "${x.q}" — add it to ENTITIES, or it is escaped twice on the page`); break; }
    if (EMAIL.test((q + a).replace(/<!--email_off-->[\s\S]*?<!--\/email_off-->/g, ''))) { stop(`an email address in "${x.q}" outside <!--email_off-->…<!--/email_off--> — Cloudflare would serve it as "[email protected]" and the page would not say what its schema says`); break; }
    faq.push(x);
  }
  if (faq.length !== shown.length) continue;
  if (!h.includes('</head>')) { stop('no </head> to write the FAQPage into'); continue; }
  const canonical = (h.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["']([^"']+)["']/i) || [])[1];
  const node = {
    '@context': 'https://schema.org', '@type': 'FAQPage', ...(canonical ? { '@id': `${canonical}#faq` } : {}),
    mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a, upvoteCount: 0 } })),
  };
  /* A function, so a "$&" or "$'" in an answer is text, not a replacement pattern. */
  h = h.replace('</head>', () => `<script type="application/ld+json">\n${JSON.stringify(node).replace(/</g, '\\u003c')}\n</script>\n</head>`);
  fs.writeFileSync(file, h);
  faqPages++; faqQs += faq.length;
}
if (faqStops.length) {
  console.error("  ✗ FAQ: the schema is the page's visible FAQ, and the build writes it — fix the page:");
  for (const s of faqStops) console.error(`      ${s}`);
  process.exit(1);
}
console.log(`  FAQPage: written from the page's FAQ on ${faqPages} page(s), ${faqQs} question(s)`);

/* The sitemap's dates: each URL gets the day its page last changed — never the
   build date, which engines learn to ignore — and each page's WebPage
   dateModified the same. site-kit lastmod reads them from .indexnow.json (what
   the last deploy submitted); a changed or new page gets today. */
const KIT = path.join(os.homedir(), 'site-kit/bin/site-kit.mjs');
if (fs.existsSync(KIT)) {
  const r = spawnSync(process.execPath, [KIT, 'lastmod', ROOT], { stdio: 'inherit' });
  if (r.status) process.exitCode = r.status;
}
