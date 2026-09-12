#!/usr/bin/env node
/* Daily watchdog for the NCC Search campaign (runs from
 * ~/bin/ncc-ads-conversions.sh). On 2026-09-11 Google's "Recommendations
 * Auto-Apply" silently removed the $14 CPC ceiling and put the campaign back on
 * Maximize Conversions; average CPC had been $27 under that strategy and $10
 * under Maximize Clicks with the cap. This script re-asserts the settings the
 * owner approved and reports anything that drifted:
 *
 *   - bidding: TARGET_SPEND (Maximize Clicks) with a $14.00 CPC ceiling
 *   - the MAXIMIZE_CONVERSIONS_OPT_IN auto-apply subscription stays PAUSED
 *   - the original "Ad group 1" (205288786704) stays PAUSED
 *   - the campaign stays on Search only (no partners, no Display)
 *
 * Everything is idempotent; a clean run prints one line per check.
 */
const env = process.env;
const CUSTOMER = '8968122786', CAMPAIGN = '24052252978', OLD_AG = '205288786704', API = 'https://googleads.googleapis.com/v25';
const CAP_MICROS = '14000000';
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const post = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(p + ' → ' + JSON.stringify(r.error).slice(0, 500)); return r; };
const gaql = async (q) => (await post('/googleAds:search', { query: q })).results || [];
const stamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || !/National Closet/.test(cust.descriptiveName)) throw new Error('guard: wrong account ' + cust.descriptiveName);

let fixed = 0;
// 1) bidding strategy + cap
const c = (await gaql(`SELECT campaign.bidding_strategy_type, campaign.target_spend.cpc_bid_ceiling_micros, campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.status FROM campaign WHERE campaign.id = ${CAMPAIGN}`))[0].campaign;
const capOk = c.biddingStrategyType === 'TARGET_SPEND' && String(c.targetSpend?.cpcBidCeilingMicros) === CAP_MICROS;
if (capOk) console.log(`${stamp()} guard: bidding ok (Maximize Clicks, $14 cap)`);
else {
  console.log(`${stamp()} guard: bidding DRIFTED to ${c.biddingStrategyType} cap=${c.targetSpend?.cpcBidCeilingMicros || 'none'} — restoring`);
  await post('/campaigns:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/campaigns/${CAMPAIGN}`, targetSpend: { cpcBidCeilingMicros: CAP_MICROS } }, updateMask: 'target_spend.cpc_bid_ceiling_micros' }] });
  fixed++;
}
if (c.networkSettings?.targetSearchNetwork || c.networkSettings?.targetContentNetwork) {
  console.log(`${stamp()} guard: network DRIFTED (partners=${c.networkSettings.targetSearchNetwork} display=${c.networkSettings.targetContentNetwork}) — restoring Search only`);
  await post('/campaigns:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/campaigns/${CAMPAIGN}`, networkSettings: { targetSearchNetwork: false, targetContentNetwork: false } }, updateMask: 'network_settings.target_search_network,network_settings.target_content_network' }] });
  fixed++;
} else console.log(`${stamp()} guard: network ok (Search only)`);

// 2) auto-apply subscription
const subs = await gaql('SELECT recommendation_subscription.type, recommendation_subscription.status FROM recommendation_subscription');
const mc = subs.find((s) => s.recommendationSubscription.type === 'MAXIMIZE_CONVERSIONS_OPT_IN');
if (mc && mc.recommendationSubscription.status === 'ENABLED') {
  console.log(`${stamp()} guard: MAXIMIZE_CONVERSIONS_OPT_IN auto-apply is ENABLED again — pausing`);
  await post('/recommendationSubscriptions:mutateRecommendationSubscription', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/recommendationSubscriptions/MAXIMIZE_CONVERSIONS_OPT_IN`, status: 'PAUSED' }, updateMask: 'status' }] });
  fixed++;
} else console.log(`${stamp()} guard: auto-apply Maximize Conversions ${mc ? mc.recommendationSubscription.status : 'absent'}`);
const others = subs.filter((s) => s.recommendationSubscription.status === 'ENABLED').map((s) => s.recommendationSubscription.type);
if (others.length) console.log(`${stamp()} guard: NOTE ${others.length} other auto-apply subscription(s) still enabled (${others.join(', ')}) — turn off in Recommendations → Auto-apply`);

// 3) old ad group
const ag = (await gaql(`SELECT ad_group.status FROM ad_group WHERE ad_group.id = ${OLD_AG}`))[0]?.adGroup;
if (ag && ag.status === 'ENABLED') {
  console.log(`${stamp()} guard: old "Ad group 1" re-enabled — pausing`);
  await post('/adGroups:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/adGroups/${OLD_AG}`, status: 'PAUSED' }, updateMask: 'status' }] });
  fixed++;
} else console.log(`${stamp()} guard: old ad group ${ag?.status || 'gone'}`);

// 4) anything Google's automation changed in the last day, for the log
const since = new Date(Date.now() - 26 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const until = new Date().toISOString().slice(0, 19).replace('T', ' ');
try {
  const auto = await gaql(`SELECT change_event.change_date_time, change_event.change_resource_type, change_event.changed_fields FROM change_event WHERE change_event.change_date_time >= '${since}' AND change_event.change_date_time <= '${until}' AND change_event.client_type = 'GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION' LIMIT 20`);
  for (const r of auto) console.log(`${stamp()} guard: auto-apply changed ${r.changeEvent.changeResourceType} (${r.changeEvent.changedFields}) at ${r.changeEvent.changeDateTime}`);
} catch (e) { /* change_event is best-effort */ }
console.log(`${stamp()} guard: done, ${fixed} setting(s) restored`);
