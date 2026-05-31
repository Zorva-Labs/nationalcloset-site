#!/usr/bin/env node
// One-time admin bootstrap.
//
// Usage:
//   node crm/setup-admin.mjs <email> [password]
//
// If no password is provided, generates one and prints it.
// Hashes with PBKDF2-SHA256, 100k iterations, 16-byte salt (matches Workers code).
// Inserts directly into D1 via the Cloudflare API.

import { pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const ACCOUNT_ID = "90656e3c5d6b57a43d0b2bb60c53e5b0";
const DB_ID = "f5787ce4-29f9-43be-bf0e-cb486f1ec8e9";
const PBKDF2_ITERATIONS = 100_000;

// Load creds from ~/.env
const envText = readFileSync(`${homedir()}/.env`, "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(Boolean).filter(l => !l.startsWith("#")).map(l => {
    const i = l.indexOf("=");
    return i < 0 ? [l, ""] : [l.slice(0, i), l.slice(i + 1)];
  })
);

const [, , emailArg, pwArg] = process.argv;
if (!emailArg) {
  console.error("Usage: node crm/setup-admin.mjs <email> [password]");
  process.exit(1);
}
const email = emailArg.trim().toLowerCase();
const password = pwArg || generatePassword();

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, "sha256");
const saltB64 = salt.toString("base64");
const hashB64 = hash.toString("base64");

const sql = `INSERT INTO admin_users (email, password_hash, password_salt, display_name)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(email) DO UPDATE SET
               password_hash = excluded.password_hash,
               password_salt = excluded.password_salt`;

const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
  {
    method: "POST",
    headers: {
      "X-Auth-Email": env.CLOUDFLARE_EMAIL,
      "X-Auth-Key": env.CLOUDFLARE_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sql,
      params: [email, hashB64, saltB64, email.split("@")[0]],
    }),
  }
);
const body = await res.json();
if (!body.success) {
  console.error("FAILED:", JSON.stringify(body.errors, null, 2));
  process.exit(1);
}

console.log("\n  ✓ Admin user provisioned");
console.log(`  email:    ${email}`);
console.log(`  password: ${password}`);
console.log(`\n  Sign in at: https://nationalclosetco.com/crm/login.html\n`);

function generatePassword() {
  // 14-char alphanumeric (~80 bits), ambiguous chars removed
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < 14; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
