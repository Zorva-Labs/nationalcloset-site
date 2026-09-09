#!/usr/bin/env node
/* One-time cutover, safe to run daily: pause the original "Ad group 1"
 * (205288786704) in the NCC Search campaign once every ad in the six intent
 * ad groups created on 2026-09-08 has passed policy review. Until then the old
 * group keeps serving so there is never a day with no approved ad. Idempotent:
 * exits quietly once the old group is paused. Runs from ncc-ads-conversions.sh. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CUSTOMER = '8968122786', CAMPAIGN = '24052252978', OLD_AG = '205288786704', API = 'https://googleads.googleapis.com/v25';
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.env'), 'utf8').split('\n').filter((l) => /^GOOGLE_ADS_/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const call = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 400)); return r; };
const gaql = async (q) => (await call('/googleAds:search', { query: q })).results || [];
const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || cust.descriptiveName !== 'National Closet Company') throw new Error('wrong account ' + JSON.stringify(cust));
const old = (await gaql(`SELECT ad_group.status FROM ad_group WHERE ad_group.id = ${OLD_AG}`))[0]?.adGroup;
if (!old || old.status !== 'ENABLED') { console.log(`cutover already done (Ad group 1 is ${old?.status || 'gone'})`); process.exit(0); }
const ads = await gaql(`SELECT ad_group.name, ad_group_ad.policy_summary.approval_status, ad_group_ad.policy_summary.review_status FROM ad_group_ad WHERE campaign.id = ${CAMPAIGN} AND ad_group_ad.status = 'ENABLED' AND ad_group.id != ${OLD_AG} AND ad_group.status = 'ENABLED'`);
const pending = ads.filter((a) => !['APPROVED', 'APPROVED_LIMITED'].includes(a.adGroupAd.policySummary?.approvalStatus));
if (!ads.length || pending.length) { console.log(`${pending.length}/${ads.length} new ad(s) still in review (${pending.map((a) => a.adGroup.name).join(', ')}); Ad group 1 stays on`); process.exit(0); }
await call('/adGroups:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/adGroups/${OLD_AG}`, status: 'PAUSED' }, updateMask: 'status' }] });
console.log(`all ${ads.length} new ads approved -> paused Ad group 1 (${OLD_AG})`);
