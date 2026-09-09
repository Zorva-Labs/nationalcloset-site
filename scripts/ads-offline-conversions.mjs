#!/usr/bin/env node
/* Upload booked consultations from the CRM to Google Ads as offline conversions.
 *
 *   node scripts/ads-offline-conversions.mjs            # upload anything new
 *   node scripts/ads-offline-conversions.mjs --dry-run  # show what would go
 *
 * Why: the campaign's bidding only sees form submits. A booked in-home
 * consultation is the signal that actually matters, and every web lead already
 * carries its click id (leads.gclid holds gclid, gbraid or wbraid). Each
 * consultation appointment for such a lead is sent once to the conversion
 * action "Booked consultation (CRM import)"; the D1 table
 * ads_conversion_uploads is the ledger so nothing is sent twice.
 *
 * Credentials: GOOGLE_ADS_* in ~/.env (michael@elopementsinc.com, admin on the
 * NCC account 896-812-2786). D1 is reached through wrangler, so run from the
 * repo (wrangler.toml binds nationalcloset-crm). The account id is hard-coded
 * and asserted by name so this can never write to any other Ads account.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CUSTOMER = '8968122786';
const CUSTOMER_NAME = 'National Closet Company';
const ACTION_NAME = 'Booked consultation (CRM import)';
const API = 'https://googleads.googleapis.com/v25';
const dry = process.argv.includes('--dry-run');

// ~/.env is plain KEY=value lines; load only what we need.
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.env'), 'utf8').split('\n')
  .filter((l) => /^GOOGLE_ADS_|^CLOUDFLARE_/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
for (const k of ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_DEVELOPER_TOKEN']) if (!env[k]) throw new Error(`${k} missing from ~/.env`);

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'nationalcloset-crm', '--remote', '--json', '--command', sql],
    { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), encoding: 'utf8', env: { ...process.env, CLOUDFLARE_API_KEY: env.CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL: env.CLOUDFLARE_EMAIL }, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0].results;
}
async function token() {
  const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
  const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}
const tok = await token();
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
async function gaql(q) {
  const r = await (await fetch(`${API}/customers/${CUSTOMER}/googleAds:search`, { method: 'POST', headers, body: JSON.stringify({ query: q }) })).json();
  if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 400));
  return r.results || [];
}
// Guard: refuse to run against anything but the NCC account.
const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || cust.descriptiveName !== CUSTOMER_NAME) throw new Error(`wrong account: ${JSON.stringify(cust)}`);
const action = (await gaql(`SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.name = '${ACTION_NAME}' AND conversion_action.status = 'ENABLED'`))[0]?.conversionAction?.resourceName;
if (!action) throw new Error(`conversion action "${ACTION_NAME}" not found`);

/* Consultation appointments for leads that arrived from an ad click and have
   not been uploaded yet. created_at is UTC (D1 datetime('now')). Google only
   accepts conversions from the last 90 days, and the click must precede it. */
const rows = d1(`SELECT a.id AS appointment_id, a.lead_id, a.created_at, a.status, l.gclid AS click_id, l.created_at AS lead_at
  FROM appointments a JOIN leads l ON l.id = a.lead_id
  WHERE a.type = 'consultation' AND a.status != 'cancelled' AND l.gclid IS NOT NULL AND l.gclid != ''
    AND a.created_at >= datetime('now', '-89 days')
    AND a.id NOT IN (SELECT appointment_id FROM ads_conversion_uploads)
  ORDER BY a.created_at`);
if (!rows.length) { console.log('nothing new to upload'); process.exit(0); }
const kind = (v) => (v.startsWith('0AAAA') ? 'gbraid' : v.startsWith('1AAAA') ? 'wbraid' : 'gclid');
const conversions = rows.map((r) => ({ [kind(r.click_id)]: r.click_id, conversionAction: action, conversionDateTime: r.created_at.replace('T', ' ').slice(0, 19) + '+00:00', conversionValue: 1, currencyCode: 'USD' }));
console.log(`${rows.length} booked consultation(s) to upload:`);
rows.forEach((r, i) => console.log(`  appt ${r.appointment_id} lead ${r.lead_id} booked ${r.created_at} (${kind(r.click_id)} …${r.click_id.slice(-6)}, lead created ${r.lead_at})`));
if (dry) process.exit(0);

const res = await (await fetch(`${API}/customers/${CUSTOMER}:uploadClickConversions`, { method: 'POST', headers, body: JSON.stringify({ conversions, partialFailure: true, validateOnly: false }) })).json();
if (res.error) throw new Error('upload failed: ' + JSON.stringify(res.error).slice(0, 600));
const failures = res.partialFailureError ? (res.partialFailureError.details || []).flatMap((d) => d.errors || []) : [];
const failedIdx = new Set(failures.map((e) => e.location?.fieldPathElements?.find((p) => p.fieldName === 'conversions')?.index).filter((i) => i != null));
rows.forEach((r, i) => {
  const ok = !failedIdx.has(i);
  const err = failures.filter((e) => e.location?.fieldPathElements?.find((p) => p.fieldName === 'conversions')?.index === i).map((e) => e.message).join('; ');
  console.log(`  appt ${r.appointment_id}: ${ok ? 'uploaded' : 'FAILED — ' + err}`);
  if (ok) d1(`INSERT INTO ads_conversion_uploads (appointment_id, lead_id, click_id, click_id_kind, conversion_time, result) VALUES (${r.appointment_id}, ${r.lead_id}, '${r.click_id.replace(/'/g, '')}', '${kind(r.click_id)}', '${conversions[i].conversionDateTime}', '${JSON.stringify(res.results?.[i] || {}).replace(/'/g, '')}')`);
});
console.log(`done: ${rows.length - failedIdx.size} uploaded, ${failedIdx.size} failed`);
