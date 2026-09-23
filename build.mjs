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
    if (!r || /^[a-z][a-z0-9+.-]*:|^\/\/|[${}+<>\s]/i.test(r)) continue;
    const abs = r.startsWith('/') ? r : path.posix.join(at, r);
    if (abs.startsWith('/cdn-cgi/') || routes.some((p) => abs === p || abs.startsWith(`${p}/`))) continue;
    if (!served(abs)) missing.add(`${abs}  (${path.relative(OUT, file)})`);
  }
}
if (missing.size) {
  console.log(`  ! ${missing.size} file(s) a page names are not in dist/ — put them on the list above, or fix the link:`);
  for (const x of [...missing].slice(0, 25)) console.log(`      ${x}`);
}

/* The sitemap's dates: each URL gets the day its page last changed — never the
   build date, which engines learn to ignore — and each page's WebPage
   dateModified the same. site-kit lastmod reads them from .indexnow.json (what
   the last deploy submitted); a changed or new page gets today. */
const KIT = path.join(os.homedir(), 'site-kit/bin/site-kit.mjs');
if (fs.existsSync(KIT)) {
  const r = spawnSync(process.execPath, [KIT, 'lastmod', ROOT], { stdio: 'inherit' });
  if (r.status) process.exitCode = r.status;
}
