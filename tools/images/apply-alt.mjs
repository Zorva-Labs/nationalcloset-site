#!/usr/bin/env node
// Point every <img> at the right alt text for the picture it now shows.
// One accurate description per image, wherever that image appears.
import fs from 'node:fs';
import path from 'node:path';
import { IMAGES } from './manifest.js';

const ROOT = process.cwd();
const ALT = new Map(IMAGES.map((i) => [i.file, i.alt]));
const SUFFIX = /-(400|480|560|800|840|1200)$/;      // responsive variants share the base image
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'crm' || e.name === 'functions') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) files.push(p);
  }
})(ROOT);

let touched = 0, swaps = 0;
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8');
  let after = before.replace(/<img\b[^>]*>/g, (tag) => {
    const m = tag.match(/\ssrc="\/img\/([^"?]+)(?:\?[^"]*)?"/);
    if (!m) return tag;
    let base = m[1].replace(/\.(webp|jpg|png)$/, '').replace(SUFFIX, '');
    const alt = ALT.get(base);
    if (!alt) return tag;
    swaps++;
    return /\salt="/.test(tag)
      ? tag.replace(/\salt="[^"]*"/, ` alt="${esc(alt)}"`)
      : tag.replace(/<img\b/, `<img alt="${esc(alt)}"`);
  });
  if (after !== before) { fs.writeFileSync(f, after); touched++; }
}
console.log(`alt text: ${swaps} <img> tag(s) updated across ${touched} file(s)`);
