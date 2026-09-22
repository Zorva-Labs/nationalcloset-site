#!/usr/bin/env node
// Generate the site's look images with Venice. Reads the balance first and stops on the
// first 402 (a blind retry turns one 402 into a wall of 429s). Writes PNGs to OUT_DIR.
//   node tools/images/generate.mjs [file-slug ...]     (no args = every image not yet made)
import fs from 'node:fs';
import path from 'node:path';
import { IMAGES } from './manifest.js';
import { prompt } from './rules.js';

const KEY = process.env.VENICE_API_KEY;
const BASE = process.env.VENICE_API_BASE || 'https://api.venice.ai/api/v1';
const MODEL = process.env.VENICE_MODEL || 'flux-2-max';
const OUT = process.env.OUT_DIR;
if (!KEY) { console.error('VENICE_API_KEY missing — set -a; . ~/.env; set +a'); process.exit(1); }
if (!OUT) { console.error('OUT_DIR missing'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const balance = async () => {
  const r = await fetch(`${BASE}/api_keys/rate_limits`, { headers: { Authorization: `Bearer ${KEY}` } });
  const j = await r.json();
  return { usd: j.data?.balances?.USD ?? 0, ok: j.data?.accessPermitted };
};

const only = process.argv.slice(2);
const todo = IMAGES.filter((i) => (only.length ? only.includes(i.file) : !fs.existsSync(path.join(OUT, `${i.file}.png`))));

let b = await balance();
console.log(`balance $${b.usd.toFixed(2)}, accessPermitted ${b.ok} — ${todo.length} image(s) to make with ${MODEL}`);
if (!b.ok) { console.error('access not permitted; top up at https://venice.ai/settings/api'); process.exit(1); }

let made = 0; const failed = [];
const CONC = Number(process.env.CONCURRENCY || 5);
let stop = false;
const queue = todo.slice();

async function one(img) {
  const body = { model: MODEL, prompt: prompt(img.subject), aspect_ratio: img.ar, format: 'png', safe_mode: false };
  const r = await fetch(`${BASE}/image/generate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 402) { stop = true; throw new Error('402 insufficient balance'); }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
  const ct = r.headers.get('content-type') || '';
  let buf;
  if (ct.includes('application/json')) {
    const j = await r.json();
    if (!j.images?.[0]) throw new Error('no image in response');
    buf = Buffer.from(j.images[0], 'base64');   // base64 -> Buffer directly, never through a string
  } else {
    buf = Buffer.from(await r.arrayBuffer());
  }
  fs.writeFileSync(path.join(OUT, `${img.file}.png`), buf);
  return buf.length;
}

async function worker() {
  while (!stop) {
    const img = queue.shift();
    if (!img) return;
    try {
      const bytes = await one(img);
      made++;
      console.log(`  ${String(made).padStart(2)}/${todo.length}  ${img.file}  ${(bytes / 1024).toFixed(0)} KB`);
    } catch (e) {
      failed.push(img.file);
      console.log(`  --  FAIL ${img.file}: ${e.message}`);
      if (stop) console.error('STOP: out of balance — top up, then re-run.');
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));

b = await balance();
console.log(`\nmade ${made}, failed ${failed.length}${failed.length ? ': ' + failed.join(' ') : ''}`);
console.log(`balance now $${b.usd.toFixed(2)}`);
