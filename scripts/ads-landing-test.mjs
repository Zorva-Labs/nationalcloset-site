// Landing-page test for the NCC Search campaign: the Ads landing page
// (/free-design) against the homepage. 2026-09-13.
//
// Every closet ad group gets a second responsive search ad that is a copy of
// its current one with the homepage as the final URL, and the campaign rotates
// ads evenly so the split is fair. The CRM records the landing page on every
// lead, so the result is read from both sides.
//
//   node scripts/ads-landing-test.mjs            # validate only
//   node scripts/ads-landing-test.mjs --apply    # create the ads + set rotation
//   node scripts/ads-landing-test.mjs --report   # per-ad results, last 21 days
//   node scripts/ads-landing-test.mjs --end      # pause the homepage ads, restore Optimize
const env = process.env, ARG = process.argv.slice(2);
const APPLY = ARG.includes('--apply'), REPORT = ARG.includes('--report'), END = ARG.includes('--end');
const CUSTOMER = '8968122786', CAMP = '24052252978', API = 'https://googleads.googleapis.com/v25';
const HOME = 'https://nationalclosetco.com/';
const GROUPS = ['199360799705', '199360800185', '200918893358', '200918893638', '203862161990']; // the closet groups; pantry keeps its own page
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const post = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(p + ' → ' + JSON.stringify(r.error).slice(0, 600)); return r; };
const gaql = async (q) => (await post('/googleAds:search', { query: q })).results || [];
const $ = (m) => (Number(m || 0) / 1e6).toFixed(2);
const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || !/National Closet/.test(cust.descriptiveName)) throw new Error('wrong account: ' + cust.descriptiveName);

if (REPORT) {
  console.log('== landing-page test, last 21 days (per ad) ==');
  for (const r of await gaql(`SELECT ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.status, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.cost_per_conversion FROM ad_group_ad WHERE campaign.id = ${CAMP} AND ad_group.status = 'ENABLED' AND ad_group_ad.status != 'REMOVED' AND segments.date DURING LAST_30_DAYS ORDER BY ad_group.name`)) {
    const m = r.metrics, u = (r.adGroupAd.ad.finalUrls || [])[0] || '';
    console.log(`  ${r.adGroup.name.padEnd(30)} ${u === HOME ? 'HOME   ' : 'LANDING'} ${r.adGroupAd.status.padEnd(7)} imp=${String(m.impressions).padStart(4)} clk=${String(m.clicks).padStart(3)} ctr=${(Number(m.ctr) * 100).toFixed(1)}% cost=$${$(m.costMicros)} conv=${m.conversions} cpa=$${$(m.costPerConversion)}`);
  }
  process.exit(0);
}

const ads = await gaql(`SELECT ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.status, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.ad.responsive_search_ad.path1, ad_group_ad.ad.responsive_search_ad.path2 FROM ad_group_ad WHERE campaign.id = ${CAMP} AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'`);

if (END) {
  const homeAds = ads.filter((r) => (r.adGroupAd.ad.finalUrls || [])[0] === HOME && r.adGroupAd.status === 'ENABLED');
  if (homeAds.length) await post('/adGroupAds:mutate', { operations: homeAds.map((r) => ({ update: { resourceName: `customers/${CUSTOMER}/adGroupAds/${r.adGroup.id}~${r.adGroupAd.ad.id}`, status: 'PAUSED' }, updateMask: 'status' })) });
  await post('/campaigns:mutate', { operations: [{ update: { resourceName: `customers/${CUSTOMER}/campaigns/${CAMP}`, adServingOptimizationStatus: 'OPTIMIZE' }, updateMask: 'ad_serving_optimization_status' }] });
  console.log(`ended: ${homeAds.length} homepage ad(s) paused, rotation back to Optimize`);
  process.exit(0);
}

const ops = [];
for (const gid of GROUPS) {
  const inGroup = ads.filter((r) => r.adGroup.id === gid && r.adGroupAd.status === 'ENABLED');
  if (inGroup.some((r) => (r.adGroupAd.ad.finalUrls || [])[0] === HOME)) { console.log(`  ${inGroup[0].adGroup.name}: homepage ad already exists — skipping`); continue; }
  const src = inGroup.find((r) => (r.adGroupAd.ad.finalUrls || [])[0] !== HOME);
  if (!src) { console.log(`  group ${gid}: no source ad`); continue; }
  const rsa = src.adGroupAd.ad.responsiveSearchAd;
  ops.push({ create: { adGroup: `customers/${CUSTOMER}/adGroups/${gid}`, status: 'ENABLED', ad: { finalUrls: [HOME], responsiveSearchAd: { headlines: rsa.headlines.map((h) => ({ text: h.text })), descriptions: rsa.descriptions.map((d) => ({ text: d.text })), path1: rsa.path1 || undefined, path2: rsa.path2 || undefined } } } });
  console.log(`  ${src.adGroup.name}: homepage copy of ad ${src.adGroupAd.ad.id} prepared (${rsa.headlines.length} headlines)`);
}
if (ops.length) {
  await post('/adGroupAds:mutate', { operations: ops, validateOnly: true });
  console.log(`validated ${ops.length} homepage ad(s)`);
}
const rot = { operations: [{ update: { resourceName: `customers/${CUSTOMER}/campaigns/${CAMP}`, adServingOptimizationStatus: 'ROTATE_INDEFINITELY' }, updateMask: 'ad_serving_optimization_status' }] };
try { await post('/campaigns:mutate', { ...rot, validateOnly: true }); console.log('validated rotation: rotate indefinitely'); } catch (e) { console.log('rotation change refused:', e.message.slice(0, 200)); rot.operations = []; }
if (APPLY) {
  if (ops.length) { const r = await post('/adGroupAds:mutate', { operations: ops }); console.log(`APPLIED: ${(r.results || []).length} homepage ad(s) created`); }
  if (rot.operations.length) { await post('/campaigns:mutate', rot); console.log('APPLIED: even rotation'); }
} else console.log('validate only — re-run with --apply');
