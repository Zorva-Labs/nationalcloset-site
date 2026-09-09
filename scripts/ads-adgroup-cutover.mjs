#!/usr/bin/env node
/* Daily, idempotent housekeeping for the NCC Search campaign (runs from
 * ~/bin/ncc-ads-conversions.sh). Two tasks, each a no-op once done:
 *
 *  1. cutover  — pause the original "Ad group 1" (205288786704) once every ad
 *     in the six intent ad groups created on 2026-09-08 has passed review.
 *     Until then the old group keeps serving so there is never a day with no
 *     approved ad.
 *  2. calls    — point the campaign's call asset at the "Calls from ads (30s+)"
 *     conversion. Google refuses this until the account owner accepts the
 *     "Call and Messaging Ads Terms" in the Ads UI, so it simply retries daily
 *     and succeeds on the first run after that.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const CUSTOMER = '8968122786', CAMPAIGN = '24052252978', OLD_AG = '205288786704', API = 'https://googleads.googleapis.com/v25';
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.env'), 'utf8').split('\n').filter((l) => /^GOOGLE_ADS_/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const call = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 500)); return r; };
const gaql = async (q) => (await call('/googleAds:search', { query: q })).results || [];
const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || cust.descriptiveName !== 'National Closet Company') throw new Error('wrong account ' + JSON.stringify(cust));

async function cutover() {
  const old = (await gaql(`SELECT ad_group.status FROM ad_group WHERE ad_group.id = ${OLD_AG}`))[0]?.adGroup;
  if (!old || old.status !== 'ENABLED') return console.log(`cutover: already done (Ad group 1 is ${old?.status || 'gone'})`);
  const ads = await gaql(`SELECT ad_group.name, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE campaign.id = ${CAMPAIGN} AND ad_group_ad.status = 'ENABLED' AND ad_group.id != ${OLD_AG} AND ad_group.status = 'ENABLED'`);
  const pending = ads.filter((a) => !['APPROVED', 'APPROVED_LIMITED'].includes(a.adGroupAd.policySummary?.approvalStatus));
  if (!ads.length || pending.length) return console.log(`cutover: ${pending.length}/${ads.length} new ad(s) still in review (${pending.map((a) => a.adGroup.name).join(', ')}); Ad group 1 stays on`);
  await call('/adGroups:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/adGroups/${OLD_AG}`, status: 'PAUSED' }, updateMask: 'status' }] });
  console.log(`cutover: all ${ads.length} new ads approved -> paused Ad group 1 (${OLD_AG})`);
}
async function calls() {
  const target = (await gaql("SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.name = 'Calls from ads (30s+)' AND conversion_action.status = 'ENABLED'"))[0]?.conversionAction?.resourceName;
  if (!target) return console.log('calls: conversion action "Calls from ads (30s+)" not found');
  const assets = await gaql(`SELECT campaign.id, asset.resource_name, asset.call_asset.call_conversion_action FROM campaign_asset WHERE campaign.id = ${CAMPAIGN} AND campaign_asset.field_type = 'CALL' AND campaign_asset.status != 'REMOVED'`);
  const todo = assets.filter((a) => a.asset.callAsset?.callConversionAction !== target);
  if (!todo.length) return console.log(`calls: ${assets.length} call asset(s) already count 30s+ calls`);
  for (const a of todo) {
    try {
      await call('/assets:mutate', { operations: [{ update: { resourceName: a.asset.resourceName, callAsset: { callConversionReportingState: 'USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION', callConversionAction: target } }, updateMask: 'call_asset.call_conversion_reporting_state,call_asset.call_conversion_action' }] });
      console.log(`calls: attached 30s+ call conversion to ${a.asset.resourceName}`);
    } catch (e) {
      console.log(/CALL_CUSTOMER_CONSENT/.test(e.message) ? 'calls: waiting for the owner to accept the "Call and Messaging Ads Terms" in the Ads UI; will retry tomorrow' : 'calls: ' + e.message);
    }
  }
}
await cutover();
await calls();
