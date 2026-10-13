// One-off copy pass on the NCC Search Campaign, 2026-10-13: every "half the
// price" claim (and the general "Save Thousands" headline) comes out of the
// responsive search ads, replaced by the one job that backs a national-brand
// comparison — a large walk-in the national brands quoted at $12,000–$17,000
// that we built for $6,700 (/blog/large-walk-in-closet-6700). Michael,
// 2026-10-13: "update the ads too". Only the matching headlines and
// descriptions change; every other headline, its order and its pin, the paths,
// statuses, budgets, bids and keywords are left as they are. The campaign stays
// paused. validateOnly first, then apply; a rerun finds nothing to change.
//
//   node scripts/ads-copy-2026-10-13.mjs            # validate only
//   node scripts/ads-copy-2026-10-13.mjs --apply
const env = process.env, APPLY = process.argv.includes('--apply');
const CUSTOMER = '8968122786', CAMP = '24052252978', API = 'https://googleads.googleapis.com/v25';
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const post = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(p + ' → ' + JSON.stringify(r.error).slice(0, 900)); return r; };
const gaql = async (q) => { const out = []; let pageToken; do { const r = await post('/googleAds:search', { query: q, pageToken }); out.push(...(r.results || [])); pageToken = r.nextPageToken; } while (pageToken); return out; };
const mutate = async (p, operations, label) => { await post(p, { operations, validateOnly: true, partialFailure: false }); console.log(`  validated ${label} (${operations.length})`); if (APPLY) { const r = await post(p, { operations }); console.log(`  APPLIED ${label} (${(r.results || []).length})`); } };

const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || !/National Closet/.test(cust.descriptiveName)) throw new Error('wrong account: ' + cust.descriptiveName);
console.log(`account: ${cust.descriptiveName} ${cust.id} — ${APPLY ? 'APPLYING' : 'validate only'}`);

// The claim, in any wording we have used.
const CLAIM = /half|50\s*%|fraction of|save thousands/i;
const PANTRY = '203862161190', GARAGE = '203862161990';
// Headlines: the first candidate the ad does not already carry.
const HEADLINE = {
  'Half the Price of the Big Guys': (ag) => ag === PANTRY ? ['One Honest Price, Upfront', 'No Pressure, No Obligation'] : ag === GARAGE ? ['No Pressure, No Obligation', 'Free In-Home 3D Design'] : ['Walk-In for $6,700, Not $17K'],
  'Save Thousands on Your Closet': () => ['One Honest Price, Upfront', 'Most Closets Done in One Day'],
};
const DESCRIPTION = {
  'Same custom-built quality as the big brands at about half the price. No 40%-off games.': 'National brands quoted one walk-in at $12K–$17K. We built it for $6,700. No 40%-off games.',
  'Walk-in and reach-in closets designed free in your home, installed at half the price.': 'A walk-in the national brands quoted at $12K–$17K, we built for $6,700. Free 3D design.',
  "Custom closets designed free in your home, installed at half the big brands' price.": 'Designed free in your home. A walk-in quoted $12K–$17K elsewhere, we built for $6,700.',
  "Custom closet design and installation in Nashville at half the big brands' price.": 'Design and installation in Nashville: a walk-in quoted $12K–$17K, built by us for $6,700.',
  'Custom closets at half the price of the national brands — one honest quote, no games.': 'National brands quoted a walk-in at $12K–$17K. We built it for $6,700. One honest quote.',
};
const PHONE = /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

const rows = await gaql(`SELECT ad_group.id, ad_group.name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad WHERE campaign.id = ${CAMP} AND ad_group_ad.status != 'REMOVED' AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'`);
const ops = [];
for (const r of rows) {
  const ad = r.adGroupAd.ad, ag = r.adGroup.id, rsa = ad.responsiveSearchAd;
  const keep = (a) => ({ text: a.text, ...(a.pinnedField ? { pinnedField: a.pinnedField } : {}) });
  let changed = false;
  const headlines = rsa.headlines.map(keep), descriptions = rsa.descriptions.map(keep);
  for (const h of headlines) {
    if (!CLAIM.test(h.text)) continue;
    if (!HEADLINE[h.text]) throw new Error(`ad ${ad.id}: no replacement for headline "${h.text}"`);
    const next = HEADLINE[h.text](ag).find((c) => !headlines.some((x) => x.text === c));
    if (!next) throw new Error(`ad ${ad.id}: every candidate for "${h.text}" is already in the ad`);
    console.log(`  ${ad.id} [${r.adGroup.name}] H: "${h.text}" → "${next}"${h.pinnedField ? ' (pin ' + h.pinnedField + ' kept)' : ''}`);
    h.text = next; changed = true;
  }
  for (const d of descriptions) {
    if (!CLAIM.test(d.text)) continue;
    if (!DESCRIPTION[d.text]) throw new Error(`ad ${ad.id}: no replacement for description "${d.text}"`);
    console.log(`  ${ad.id} [${r.adGroup.name}] D: "${d.text}" → "${DESCRIPTION[d.text]}"`);
    d.text = DESCRIPTION[d.text]; changed = true;
  }
  if (!changed) continue;
  if (new Set(headlines.map((h) => h.text)).size !== headlines.length) throw new Error(`ad ${ad.id}: duplicate headline`);
  if (new Set(descriptions.map((d) => d.text)).size !== descriptions.length) throw new Error(`ad ${ad.id}: duplicate description`);
  for (const h of headlines) if (h.text.length > 30 || CLAIM.test(h.text) || PHONE.test(h.text)) throw new Error(`ad ${ad.id}: bad headline (${h.text.length}): ${h.text}`);
  for (const d of descriptions) if (d.text.length > 90 || CLAIM.test(d.text) || PHONE.test(d.text)) throw new Error(`ad ${ad.id}: bad description (${d.text.length}): ${d.text}`);
  ops.push({ update: { resourceName: `customers/${CUSTOMER}/ads/${ad.id}`, responsiveSearchAd: { headlines, descriptions } }, updateMask: 'responsive_search_ad.headlines,responsive_search_ad.descriptions' });
}
console.log(`ads to rewrite: ${ops.length} of ${rows.length}`);
if (ops.length) await mutate('/ads:mutate', ops, 'RSA copy');
console.log(APPLY ? 'done — applied' : 'done — validation only, re-run with --apply');
