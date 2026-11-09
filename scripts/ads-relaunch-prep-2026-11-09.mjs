#!/usr/bin/env node
/* The relaunch prep of 2026-11-09 (Michael: "make all recommended changes to
 * the ad"). Validates only unless given --apply; one atomic googleAds:mutate.
 * The campaign stays PAUSED: it is asserted paused and never touched.
 *
 *  1. No prices in any ad (the site dropped every price on 2026-11-08): four
 *     new ad groups whose RSAs carry none; the price asset is unlinked.
 *  2. Six phrase-match ad groups → four broad-match ones (estate rule:
 *     consolidated broad match, no city keywords; the county targeting covers
 *     the cities): Closets, Pantries, Garage, Laundry & Wardrobes, and the new
 *     Custom Cabinets → /custom-cabinets-nashville. The six old groups are
 *     paused and renamed "(old, phrase)", kept intact as history.
 *  3. The call asset → (615) 488-3575 (the CallRail menu number), counted by
 *     "Calls from ads (30s+)", at campaign and account level; the agency line
 *     (629) 298-8241 unlinked from both.
 *  4. The WhatsApp message asset (it pointed at the agency line) unlinked.
 *  5. The campaign negative "kitchen cabinets" (broad) removed, because the
 *     cabinets group now sells kitchen cabinets.
 *
 * Unlinking an asset or pausing an ad group is reversible; nothing is deleted.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const CUSTOMER = '8968122786', CAMPAIGN = '24052252978', API = 'https://googleads.googleapis.com/v25';
const C = `customers/${CUSTOMER}`, CAMP = `${C}/campaigns/${CAMPAIGN}`;
const env = Object.fromEntries(fs.readFileSync(path.join(os.homedir(), '.env'), 'utf8').split('\n').filter((l) => /^GOOGLE_ADS_/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const call = async (p, payload) => { const r = await (await fetch(`${API}/${C}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(JSON.stringify(r.error, null, 1).slice(0, 4000)); return r; };
const gaql = async (q) => (await call('/googleAds:search', { query: q })).results || [];

const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || cust.descriptiveName !== 'National Closet Company') throw new Error('wrong account ' + JSON.stringify(cust));
const camp = (await gaql(`SELECT campaign.status FROM campaign WHERE campaign.id = ${CAMPAIGN}`))[0].campaign;
if (camp.status !== 'PAUSED') throw new Error('campaign is ' + camp.status + ', expected PAUSED; stopping');

// ---- the four new ad groups ------------------------------------------------
const SITE = 'https://nationalclosetco.com';
const GROUPS = [
  {
    name: 'Closets', url: `${SITE}/free-design`, path: ['custom-closets', 'nashville'],
    keywords: ['custom closets', 'custom closet company', 'closet company', 'closet design', 'custom closet design', 'closet designers', 'closet installation', 'custom closet installation', 'closet installers', 'custom closet systems', 'walk in closet design', 'custom walk in closet', 'walk in closet systems', 'reach in closet systems', 'luxury closets', 'closet builders', 'closet remodel', 'closet organizer installation'],
    headlines: ['Custom Closets Nashville TN', 'Free In-Home 3D Closet Design', 'Local Nashville Closet Company', 'Walk-In & Reach-In Closets', 'Closet Design & Installation', 'See Your Closet in 3D First', 'One Honest Price, Upfront', 'No Fake 40% Off Gimmicks', 'Family-Owned, Not a Franchise', 'Our Own Installers, Not Subs', 'Deeper 14″ Shelves, Standard', 'Most Closets Done in One Day', 'Rated 5.0 Stars on Google', 'Lifetime Closet Warranty', 'Book Your Free Design Today'],
    descriptions: ['A designer measures your space, shows it in 3D and quotes one honest price. Free.', 'No 40%-off games. Our everyday price is the real one, and the quote is what you pay.', 'Deeper 14″ shelves standard, installed by our own team, most closets in a single day.', 'Family-owned since 2012. Walk-ins and reach-ins across Nashville and Middle Tennessee.'],
  },
  {
    name: 'Pantries', url: `${SITE}/custom-pantry-nashville`, path: ['custom-pantry', 'nashville'],
    keywords: ['custom pantry', 'custom pantry shelving', 'custom pantry cabinets', 'pantry design', 'walk in pantry design', 'butler pantry cabinets', 'pantry remodel'],
    headlines: ['Custom Pantries Nashville TN', 'Custom Pantry Shelving', 'Walk-In & Butler Pantries', 'Pantry Cabinets Built to Fit', 'Pull-Outs, Drawers & Shelving', 'Built to the Inch, Installed', 'See Your Pantry in 3D First', 'Free In-Home 3D Design', 'One Honest Price, Upfront', 'No More Sagging Wire Shelves', 'No Fake 40% Off Gimmicks', 'Family-Owned, Not a Franchise', 'Our Own Installers, Not Subs', 'Rated 5.0 Stars on Google', 'Book Your Free Design Today'],
    descriptions: ['Custom pantries with pull-outs, deep drawers and shelving, built to the inch.', 'We replace sagging builder wire with 3/4-inch furniture board that stays flat and level.', 'Free in-home design and one honest price, quoted at the visit. No pressure, no games.', 'Walk-in, butler and kitchen pantries across Middle Tennessee. Family-owned since 2012.'],
  },
  {
    name: 'Garage, Laundry & Wardrobes', url: `${SITE}/free-design`, path: ['custom-storage', 'nashville'],
    keywords: ['custom garage cabinets', 'garage storage cabinets', 'garage storage installation', 'custom laundry room cabinets', 'custom built in wardrobe', 'custom built wardrobes'],
    // the old group's ad, which carried no price, unchanged
    headlines: ['Custom Storage Nashville TN', 'Garage Cabinets & Storage', 'Custom Wardrobes & Laundry', 'Built to Fit Your Space', 'Reclaim Your Garage Floor', 'See Your Design in 3D First', 'Our Own Installers, Not Subs', 'Free In-Home 3D Design', 'No Pressure, No Obligation', 'No Fake 40% Off Gimmicks', 'Family-Owned, Not a Franchise', 'Deeper 14″ Shelves, Standard', 'One Honest Price, Upfront', 'Serving All of Middle TN', 'Book Your Free Design Today'],
    descriptions: ['Garage cabinets, laundry rooms and wardrobes designed free and installed by us.', 'Cabinets, slatwall and overhead racks that reclaim the floor. One honest price.', 'Family-owned Nashville company, not a franchise. See your design in 3D first.', 'Built to the inch, installed by our own team across Middle Tennessee. Free design.'],
  },
  {
    name: 'Custom Cabinets', url: `${SITE}/custom-cabinets-nashville`, path: ['custom-cabinets', 'nashville'],
    keywords: ['custom cabinets', 'custom cabinet maker', 'custom kitchen cabinets', 'custom cabinetry', 'custom bathroom vanity', 'built in cabinets', 'custom built ins', 'custom entertainment center'],
    headlines: ['Custom Cabinets Nashville TN', 'Kitchen Cabinets & Islands', 'Custom Bathroom Vanities', 'Built-Ins & Media Walls', 'Laundry & Mudroom Cabinets', 'Cabinets Built to Your Walls', 'No Stock Sizes, No Fillers', 'See Your Room in 3D First', 'Free In-Home 3D Design', 'One Honest Price, Upfront', 'Installed by Our Own Team', 'Family-Owned, Not a Franchise', 'Lifetime Cabinet Warranty', 'Rated 5.0 Stars on Google', 'Book Your Free Design Today'],
    descriptions: ['Kitchens, vanities, laundry rooms and built-ins drawn to your walls, not stock widths.', 'A designer measures in person and shows the room in 3D with one exact written price.', 'Installed by the same team that builds our closets, from first measure to last hinge.', 'Free in-home design across Nashville and Middle Tennessee. Family-owned since 2012.'],
  },
];

// Google's limits, and the rules: no price, no phone number in ad text
for (const g of GROUPS) {
  const bad = [];
  if (g.headlines.length !== 15 || g.descriptions.length !== 4) bad.push('counts');
  for (const h of g.headlines) if ([...h].length > 30 || /!/.test(h)) bad.push('headline: ' + h);
  for (const d of g.descriptions) if ([...d].length > 90) bad.push(`description (${[...d].length}): ${d}`);
  for (const p of g.path) if (p.length > 15) bad.push('path: ' + p);
  for (const t of [...g.headlines, ...g.descriptions]) if (/\$|\d{3}[-. )]\d{3}|\bfrom \d/i.test(t)) bad.push('price/phone: ' + t);
  if (new Set(g.headlines).size !== 15) bad.push('duplicate headline');
  if (bad.length) throw new Error(g.name + ' → ' + bad.join(' | '));
}

// ---- what exists now ---------------------------------------------------------
const OLD = await gaql(`SELECT ad_group.id, ad_group.name, ad_group.status FROM ad_group WHERE campaign.id = ${CAMPAIGN} AND ad_group.status != 'REMOVED'`);
const OLD_NAMES = ['Closet Company Near Me', 'Custom Closets – Nashville', 'Closet Design & Installation', 'Walk-In & Reach-In Closets', 'Custom Pantry', 'Garage, Laundry & Wardrobes'];
const olds = OLD.filter((r) => OLD_NAMES.includes(r.adGroup.name));
if (OLD.some((r) => GROUPS.some((g) => g.name === r.adGroup.name) && !OLD_NAMES.includes(r.adGroup.name))) throw new Error('a new group already exists; already applied?');
if (olds.length !== 6) throw new Error(`expected the 6 phrase ad groups, found ${olds.length}: already applied?`);
const callConv = (await gaql("SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.name = 'Calls from ads (30s+)' AND conversion_action.status = 'ENABLED'"))[0].conversionAction.resourceName;
const unlinkCampaign = (await gaql(`SELECT campaign.id, campaign_asset.resource_name, campaign_asset.field_type, asset.id FROM campaign_asset WHERE campaign.id = ${CAMPAIGN} AND campaign_asset.status != 'REMOVED' AND campaign_asset.field_type IN ('PRICE','CALL','BUSINESS_MESSAGE')`)).map((r) => r.campaignAsset.resourceName);
const unlinkCustomer = (await gaql("SELECT customer_asset.resource_name, asset.call_asset.phone_number FROM customer_asset WHERE customer_asset.status != 'REMOVED' AND customer_asset.field_type = 'CALL'")).map((r) => r.customerAsset.resourceName);
const negKitchen = (await gaql(`SELECT campaign.id, campaign_criterion.resource_name, campaign_criterion.keyword.text FROM campaign_criterion WHERE campaign.id = ${CAMPAIGN} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`)).filter((r) => r.campaignCriterion.keyword.text === 'kitchen cabinets').map((r) => r.campaignCriterion.resourceName);

// ---- the batch ---------------------------------------------------------------
const ops = [];
// old groups first: pause and rename, so the new names are free
for (const r of olds) ops.push({ adGroupOperation: { update: { resourceName: r.adGroup.resourceName, status: 'PAUSED', name: `${r.adGroup.name} (old, phrase)` }, updateMask: 'status,name' } });
let tmp = -1;
for (const g of GROUPS) {
  const ag = `${C}/adGroups/${tmp--}`;
  ops.push({ adGroupOperation: { create: { resourceName: ag, campaign: CAMP, name: g.name, status: 'ENABLED', type: 'SEARCH_STANDARD' } } });
  for (const k of g.keywords) ops.push({ adGroupCriterionOperation: { create: { adGroup: ag, status: 'ENABLED', keyword: { text: k, matchType: 'BROAD' } } } });
  ops.push({ adGroupAdOperation: { create: { adGroup: ag, status: 'ENABLED', ad: { finalUrls: [g.url], responsiveSearchAd: { headlines: g.headlines.map((text) => ({ text })), descriptions: g.descriptions.map((text) => ({ text })), path1: g.path[0], path2: g.path[1] } } } } });
}
const callAsset = `${C}/assets/${tmp--}`;
ops.push({ assetOperation: { create: { resourceName: callAsset, callAsset: { countryCode: 'US', phoneNumber: '(615) 488-3575', callConversionReportingState: 'USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION', callConversionAction: callConv } } } });
for (const rn of unlinkCampaign) ops.push({ campaignAssetOperation: { remove: rn } });
for (const rn of unlinkCustomer) ops.push({ customerAssetOperation: { remove: rn } });
ops.push({ campaignAssetOperation: { create: { campaign: CAMP, asset: callAsset, fieldType: 'CALL' } } });
ops.push({ customerAssetOperation: { create: { asset: callAsset, fieldType: 'CALL' } } });
for (const rn of negKitchen) ops.push({ campaignCriterionOperation: { remove: rn } });

console.log(`${APPLY ? 'APPLY' : 'validate only'}: ${ops.length} operations`);
console.log(`  pause + rename ${olds.length} phrase groups; create ${GROUPS.length} groups, ${GROUPS.reduce((n, g) => n + g.keywords.length, 0)} broad keywords, ${GROUPS.length} RSAs`);
console.log(`  unlink ${unlinkCampaign.length} campaign assets (price, call, WhatsApp), ${unlinkCustomer.length} account call asset; new call asset (615) 488-3575; remove ${negKitchen.length} negative`);
const r = await call('/googleAds:mutate', { mutateOperations: ops, validateOnly: !APPLY });
console.log(APPLY ? `done: ${r.mutateOperationResponses.length} results` : 'valid');
