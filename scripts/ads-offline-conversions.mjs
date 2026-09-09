#!/usr/bin/env node
/* Send booked consultations to Google Ads as offline conversions, via GA4.
 *
 *   node scripts/ads-offline-conversions.mjs            # send anything new
 *   node scripts/ads-offline-conversions.mjs --dry-run  # show what would go
 *
 * Why this route: Google closed ConversionUploadService.UploadClickConversions
 * to new integrations (Sept 2026) and the replacement Data Manager API needs a
 * fresh OAuth grant. GA4's Measurement Protocol needs neither: every web lead
 * stores its GA4 client id + session id (leads.ga_client_id / ga_session_id),
 * so a `booked_consultation` event sent for that client+session lands in the
 * same GA4 session that carried the ad click. GA4 marks it a key event and
 * Google Ads imports it as the conversion "Booked consultation (GA4)".
 *
 * Limits: GA4 accepts back-dated events for 72 hours, so this runs daily
 * (launchd, 7:15 Central) and only looks at the last 70 hours. Leads that
 * arrived before ga_client_id existed (Sept 2026) cannot be sent.
 *
 * Needs NCC_GA4_MP_SECRET in ~/.env (GA4 Admin > NCC Direct stream >
 * Measurement Protocol API secrets). The D1 table ads_conversion_uploads is
 * the ledger so nothing is sent twice.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MEASUREMENT_ID = 'G-EJEDXZZWJN';
const dry = process.argv.includes('--dry-run');
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.env'), 'utf8').split('\n')
  .filter((l) => /^(NCC_GA4_MP_SECRET|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL)=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
if (!env.NCC_GA4_MP_SECRET) { console.error('NCC_GA4_MP_SECRET missing from ~/.env — create a Measurement Protocol secret on the NCC Direct stream first (needs the property\'s User Data Collection Acknowledgement).'); process.exit(2); }

function d1(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'nationalcloset-crm', '--remote', '--json', '--command', sql],
    { cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), encoding: 'utf8', env: { ...process.env, CLOUDFLARE_API_KEY: env.CLOUDFLARE_API_KEY, CLOUDFLARE_EMAIL: env.CLOUDFLARE_EMAIL }, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(out)[0].results;
}
const rows = d1(`SELECT a.id AS appointment_id, a.lead_id, a.created_at, l.ga_client_id, l.ga_session_id, l.gclid
  FROM appointments a JOIN leads l ON l.id = a.lead_id
  WHERE a.type = 'consultation' AND a.status != 'cancelled'
    AND l.ga_client_id IS NOT NULL AND l.ga_client_id != ''
    AND a.created_at >= datetime('now', '-70 hours')
    AND a.id NOT IN (SELECT appointment_id FROM ads_conversion_uploads)
  ORDER BY a.created_at`);
if (!rows.length) { console.log('nothing new to send'); process.exit(0); }
console.log(`${rows.length} booked consultation(s) to send:`);
for (const r of rows) console.log(`  appt ${r.appointment_id} lead ${r.lead_id} booked ${r.created_at} client ${r.ga_client_id} session ${r.ga_session_id || '-'} ${r.gclid ? '(ad click)' : '(no click id)'}`);
if (dry) process.exit(0);

const url = (debug) => `https://www.google-analytics.com/${debug ? 'debug/' : ''}mp/collect?measurement_id=${MEASUREMENT_ID}&api_secret=${encodeURIComponent(env.NCC_GA4_MP_SECRET)}`;
let sent = 0;
for (const r of rows) {
  const params = { engagement_time_msec: 100, appointment_id: String(r.appointment_id), lead_id: String(r.lead_id), value: 1, currency: 'USD' };
  if (r.ga_session_id) params.session_id = r.ga_session_id;
  const body = { client_id: r.ga_client_id, timestamp_micros: Date.parse(r.created_at.replace(' ', 'T') + 'Z') * 1000, non_personalized_ads: false, events: [{ name: 'booked_consultation', params }] };
  const check = await (await fetch(url(true), { method: 'POST', body: JSON.stringify(body) })).json().catch(() => ({}));
  const problems = (check.validationMessages || []).map((m) => m.description);
  if (problems.length) { console.log(`  appt ${r.appointment_id}: REJECTED — ${problems.join('; ')}`); continue; }
  const res = await fetch(url(false), { method: 'POST', body: JSON.stringify(body) });
  if (res.status >= 200 && res.status < 300) {
    sent++; console.log(`  appt ${r.appointment_id}: sent`);
    d1(`INSERT INTO ads_conversion_uploads (appointment_id, lead_id, click_id, click_id_kind, conversion_time, result) VALUES (${r.appointment_id}, ${r.lead_id}, '${r.ga_client_id.replace(/'/g, '')}', 'ga4-mp', '${r.created_at}', '{"http":${res.status}}')`);
  } else console.log(`  appt ${r.appointment_id}: FAILED http ${res.status}`);
}
console.log(`done: ${sent}/${rows.length} sent`);
