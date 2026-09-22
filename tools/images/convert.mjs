#!/usr/bin/env node
// PNG (from generate.mjs) -> the exact files the site serves: WebP at the original
// dimensions, the responsive sizes the srcsets ask for, and the 1200x630 OG cards.
import fs from 'node:fs';
import path from 'node:path';
import sharp from '/Users/zeus/nashvilles-network/node_modules/sharp/lib/index.js';
import { IMAGES } from './manifest.js';

const SRC = process.env.OUT_DIR;
const DEST = process.env.IMG_DIR || path.join(process.cwd(), 'img');
if (!SRC) { console.error('OUT_DIR missing'); process.exit(1); }

// file -> extra outputs derived from the same source
const EXTRA = {
  'hero-closet':        [['hero-closet-480.webp', 480, 480], ['hero-closet-800.webp', 800, 800], ['hero-closet-og.jpg', 1200, 630]],
  'insp-walkin-1':      [['insp-walkin-1-400.webp', 400, 400]],
  'insp-walkin-2':      [['insp-walkin-2-400.webp', 400, 400]],
  'insp-reachin-1':     [['insp-reachin-1-400.webp', 400, 400]],
  'insp-pantry-1':      [['insp-pantry-1-400.webp', 400, 400]],
  'svc-walkin':         [['svc-walkin-og.jpg', 1200, 630]],
  'svc-reachin':        [['svc-reachin-og.jpg', 1200, 630]],
  'svc-garage':         [['svc-garage-og.jpg', 1200, 630]],
  'cab-kitchen':        [['cab-kitchen-800.webp', 800, 533], ['cab-kitchen-480.webp', 480, 320], ['custom-cabinets-og.jpg', 1200, 630]],
  'blog-affordable-custom-closet-company':  [['blog-affordable-custom-closet-company-og.jpg', 1200, 630]],
  'blog-affordable-custom-closet-systems':  [['blog-affordable-custom-closet-systems-og.jpg', 1024, 1024]],
  'blog-custom-closet-cost':                [['blog-custom-closet-cost-og.jpg', 1200, 630]],
  'blog-floor-based-closet-systems':        [['blog-floor-based-closet-systems-og.jpg', 1200, 630]],
  'blog-modular-closet-systems':            [['blog-modular-closet-systems-og.jpg', 1200, 630]],
  'blog-pantry-organization':               [['blog-pantry-organization-og.jpg', 1200, 630]],
  'blog-rail-closet-systems':               [['blog-rail-closet-systems-og.jpg', 1200, 630]],
  'blog-reach-in-vs-walk-in':               [['blog-reach-in-vs-walk-in-og.jpg', 1200, 630]],
};

const write = async (src, out, w, h) => {
  const p = sharp(src).resize(w, h, { fit: 'cover', position: 'centre' });
  const buf = out.endsWith('.jpg')
    ? await p.jpeg({ quality: 84, mozjpeg: true }).toBuffer()
    : await p.webp({ quality: 82 }).toBuffer();
  fs.writeFileSync(path.join(DEST, out), buf);
  return `${out} ${w}x${h} ${(buf.length / 1024).toFixed(0)}KB`;
};

const only = process.argv.slice(2);
let n = 0;
for (const img of IMAGES) {
  if (only.length && !only.includes(img.file)) continue;
  const src = path.join(SRC, `${img.file}.png`);
  if (!fs.existsSync(src)) { console.log(`  skip ${img.file} (no png)`); continue; }
  const lines = [await write(src, `${img.file}.webp`, img.w, img.h)];
  for (const [out, w, h] of EXTRA[img.file] || []) lines.push(await write(src, out, w, h));
  n++;
  console.log(`${img.file}: ${lines.join(' | ')}`);
}
console.log(`\nconverted ${n} source image(s)`);
