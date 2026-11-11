#!/usr/bin/env node
// API keys for outside programs that post leads into the CRM
// (POST /api/inbound/lead; functions/api/inbound/lead.js, migration 0085).
//
//   node tools/crm/api-key.mjs create "GoHighLevel" [--source ghl] [--brand NCC]
//   node tools/crm/api-key.mjs list
//   node tools/crm/api-key.mjs revoke <id>
//
// `create` prints the key once. Only its SHA-256 is stored, so a lost key is
// revoked and a new one made. Keep the key in the program that sends it and,
// for our own record, in ~/.env (NCC_<SOURCE>_API_KEY) — never in the repo.
// Talks to the live D1 over the Cloudflare API with CLOUDFLARE_API_TOKEN.

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const ACCOUNT_ID = "90656e3c5d6b57a43d0b2bb60c53e5b0";
const DB_ID = "f5787ce4-29f9-43be-bf0e-cb486f1ec8e9";
const BRANDS = ["NCC", "NLC"];

const env = Object.fromEntries(
  readFileSync(`${homedir()}/.env`, "utf8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
  })
);
const token = env.CLOUDFLARE_API_TOKEN;
if (!token) { console.error("CLOUDFLARE_API_TOKEN is not in ~/.env"); process.exit(1); }

async function q(sql, params = []) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const j = await res.json();
  if (!j.success) { console.error(JSON.stringify(j.errors || j, null, 2)); process.exit(1); }
  return j.result[0].results;
}

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const usage = () => { console.error('Usage: node tools/crm/api-key.mjs create "<name>" [--source <slug>] [--brand NCC|NLC] | list | revoke <id>'); process.exit(1); };

const cmd = argv.shift();
if (cmd === "create") {
  const source = opt("--source", null);
  const brand = String(opt("--brand", "NCC")).toUpperCase();
  const name = (argv[0] || "").trim();
  if (!name || !BRANDS.includes(brand)) usage();
  const src = (source || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
  const key = "ncck_" + randomBytes(20).toString("hex");
  const hash = createHash("sha256").update(key).digest("hex");
  const [row] = await q(
    "INSERT INTO api_keys (name, source, brand, key_hash, key_prefix) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id",
    [name, src, brand, hash, key.slice(0, 12)]
  );
  console.log(`Key ${row.id} for "${name}" (source ${src}, brand ${brand}). Shown once — store it now:\n\n${key}\n`);
} else if (cmd === "list") {
  const rows = await q("SELECT id, name, source, brand, key_prefix, created_at, last_used_at, use_count, revoked_at FROM api_keys ORDER BY id");
  if (!rows.length) console.log("No API keys.");
  for (const r of rows) {
    console.log(`#${r.id}  ${r.name}  [${r.source} · ${r.brand}]  ${r.key_prefix}…  made ${r.created_at}  used ${r.use_count}× (last ${r.last_used_at || "never"})${r.revoked_at ? `  REVOKED ${r.revoked_at}` : ""}`);
  }
} else if (cmd === "revoke") {
  const id = Number(argv[0]);
  if (!id) usage();
  const rows = await q("UPDATE api_keys SET revoked_at = datetime('now') WHERE id = ?1 AND revoked_at IS NULL RETURNING id, name", [id]);
  console.log(rows.length ? `Revoked #${rows[0].id} (${rows[0].name}).` : `No live key #${id}.`);
} else usage();
