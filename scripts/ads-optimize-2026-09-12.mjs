// One-off optimisation pass on the NCC Search Campaign, 2026-09-12, after four
// days on the rebuilt account: negatives for the idea/DIY/product searches the
// phrase keywords let through, three ambiguous keywords paused, the five
// closet RSAs rewritten (unpinned, every keyword theme in a headline), and an
// ad schedule that skips midnight–6am. validateOnly first, then apply.
//
//   node scripts/ads-optimize-2026-09-12.mjs            # validate only
//   node scripts/ads-optimize-2026-09-12.mjs --apply
const env = process.env, APPLY = process.argv.includes('--apply');
const CUSTOMER = '8968122786', CAMP = '24052252978', API = 'https://googleads.googleapis.com/v25';
const body = new URLSearchParams({ client_id: env.GOOGLE_ADS_CLIENT_ID, client_secret: env.GOOGLE_ADS_CLIENT_SECRET, refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN, grant_type: 'refresh_token' });
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body })).json()).access_token;
const headers = { authorization: `Bearer ${tok}`, 'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN, 'login-customer-id': CUSTOMER, 'content-type': 'application/json' };
const post = async (p, payload) => { const r = await (await fetch(`${API}/customers/${CUSTOMER}${p}`, { method: 'POST', headers, body: JSON.stringify(payload) })).json(); if (r.error) throw new Error(p + ' → ' + JSON.stringify(r.error).slice(0, 700)); return r; };
const gaql = async (q) => (await post('/googleAds:search', { query: q })).results || [];
const mutate = async (p, operations, label) => { await post(p, { operations, validateOnly: true, partialFailure: false }); console.log(`  validated ${label} (${operations.length})`); if (APPLY) { const r = await post(p, { operations }); console.log(`  APPLIED ${label} (${(r.results || []).length})`); } };

const cust = (await gaql('SELECT customer.id, customer.descriptive_name FROM customer'))[0].customer;
if (cust.id !== CUSTOMER || !/National Closet/.test(cust.descriptiveName)) throw new Error('wrong account: ' + cust.descriptiveName);
console.log(`account: ${cust.descriptiveName} ${cust.id} — ${APPLY ? 'APPLYING' : 'validate only'}`);

// ---------------------------------------------------------------- negatives
const existing = new Set((await gaql(`SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${CAMP} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`)).map((r) => `${r.campaignCriterion.keyword.matchType}:${r.campaignCriterion.keyword.text.toLowerCase()}`));
const NEG = [
  // idea / inspiration / how-to searches (converted 1 in 30 days at $12, but 40+ clicks did not)
  ['idea', 'BROAD'], ['trend', 'BROAD'], ['trends', 'BROAD'], ['pictures', 'BROAD'], ['photos', 'BROAD'], ['inspiration', 'BROAD'],
  ['dimensions', 'BROAD'], ['dimension', 'BROAD'], ['size', 'BROAD'], ['sizes', 'BROAD'], ['depth', 'BROAD'], ['layout', 'BROAD'], ['layouts', 'BROAD'], ['floor plan', 'PHRASE'], ['3x6', 'BROAD'],
  ['app', 'BROAD'], ['online', 'BROAD'], ['calculator', 'BROAD'], ['software', 'BROAD'], ['template', 'BROAD'], ['diy', 'BROAD'], ['how to', 'PHRASE'],
  // doors, organising services and hardware, not closet systems
  ['door', 'BROAD'], ['doors', 'BROAD'], ['organization', 'BROAD'], ['organizing', 'BROAD'], ['organize', 'BROAD'], ['reorganization', 'BROAD'], ['declutter', 'BROAD'],
  ['wire', 'BROAD'], ['shelf track', 'PHRASE'], ['shelftrack', 'BROAD'], ['style selections', 'PHRASE'], ['john lewis', 'PHRASE'], ['solid wood', 'PHRASE'], ['32mm', 'BROAD'], ['french cleat', 'PHRASE'],
  ['prefab', 'BROAD'], ['pre-made', 'BROAD'], ['pre made', 'PHRASE'], ['addition', 'BROAD'], ['crafting', 'BROAD'], ['scullery', 'BROAD'], ['arched', 'BROAD'], ['linen', 'BROAD'], ['foyer', 'BROAD'], ['coffee bar', 'PHRASE'],
  // competitors that surfaced this month
  ['closet factory', 'PHRASE'], ['closet evolution', 'PHRASE'], ['one day doors', 'PHRASE'], ['university', 'BROAD'],
  // bare product queries — exact only, so "closet organizer companies" still serves
  ['closet organizer', 'EXACT'], ['closet organizers', 'EXACT'], ['closet system', 'EXACT'], ['closet systems', 'EXACT'], ['walk in closet', 'EXACT'], ['closet organization', 'EXACT'], ['modular closet systems', 'EXACT'],
];
const negOps = NEG.filter(([t, m]) => !existing.has(`${m}:${t.toLowerCase()}`)).map(([text, matchType]) => ({ create: { campaign: `customers/${CUSTOMER}/campaigns/${CAMP}`, negative: true, keyword: { text, matchType } } }));
console.log(`negatives: ${NEG.length} proposed, ${NEG.length - negOps.length} already present`);
if (negOps.length) await mutate('/campaignCriteria:mutate', negOps, 'campaign negatives');

// --------------------------------------------------------- keyword pauses
const PAUSE = ['closet organization near me', 'built in closet', 'wall closet system'];
const kws = await gaql(`SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.status FROM ad_group_criterion WHERE campaign.id = ${CAMP} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' AND ad_group.status = 'ENABLED'`);
const pauseOps = kws.filter((r) => PAUSE.includes(r.adGroupCriterion.keyword.text.toLowerCase())).map((r) => ({ update: { resourceName: r.adGroupCriterion.resourceName, status: 'PAUSED' }, updateMask: 'status' }));
console.log(`keywords to pause: ${pauseOps.length} of ${PAUSE.length}`);
if (pauseOps.length) await mutate('/adGroupCriteria:mutate', pauseOps, 'keyword pauses');

// ---------------------------------------------------------------- ad copy
const COMMON = {
  d3d: 'Free In-Home 3D Design', half: 'Half the Price of the Big Guys', no40: 'No Fake 40% Off Gimmicks', fam: 'Family-Owned, Not a Franchise',
  shelves: 'Deeper 14″ Shelves, Standard', oneday: 'Most Closets Done in One Day', book: 'Book Your Free Design Today', walkin: 'Walk-Ins From $2,500 Installed',
  reachin: 'Reach-Ins From $1,000', rated: 'Rated 5.0 Stars on Google', subs: 'Our Own Installers, Not Subs', pay: 'Flexible Payment Options',
};
const C = COMMON;
const ADS = {
  823933572717: { // Custom Closets – Nashville
    h: ['Custom Closets Nashville TN', 'Custom Closets Near You', 'Affordable Custom Closets', 'Custom Closet Systems & Design', 'Franklin, Brentwood & Beyond', C.walkin, C.reachin, C.d3d, C.half, C.no40, C.fam, C.shelves, C.rated, C.oneday, C.book],
    d: ['Custom closets designed free in your home, installed at half the big brands\' price.', 'No 40%-off games. One honest price, deeper 14″ shelves and a 3D design first.', 'Family-owned Nashville closet company. Free in-home design, flexible payments.', 'Custom closet systems for Nashville, Brentwood, Franklin, Murfreesboro & Mt. Juliet.'],
  },
  823933572930: { // Closet Company Near Me
    h: ['Local Nashville Closet Company', 'Closet Company Near You', 'Custom Closet Company', 'Closet Builders & Designers', 'Closet Organizers Near You', 'Best Value Closet Company', C.walkin, C.d3d, C.half, C.no40, C.fam, C.subs, C.rated, C.oneday, C.book],
    d: ['Family-owned Nashville closet company, not a franchise. Free design, one honest price.', 'Same custom-built quality as the big brands at about half the price. No 40%-off games.', 'Deeper 14″ shelves standard, installed by our own team, most closets in one day.', 'Serving Davidson, Williamson, Rutherford, Sumner & Wilson counties. Free design.'],
  },
  823933521306: { // Closet Design & Installation
    h: ['Custom Closet Design Nashville', 'Free In-Home Closet Design', 'Closet Designers Near You', 'Closet Installers Near You', 'Closet Design & Installation', 'Designed Free, Installed Fast', 'Small Closets to Walk-Ins', 'See Your Closet in 3D First', C.walkin, C.half, C.no40, C.fam, C.shelves, C.rated, C.book],
    d: ['A designer measures your space, shows it in 3D and quotes one honest price. Free.', 'Installed by our own team, most closets in a single day. 14″ shelves standard.', 'Custom closet design and installation in Nashville at half the big brands\' price.', 'Reach-ins from $1,000, walk-ins from $2,500, installed. Family-owned in Middle TN.'],
  },
  823933573161: { // Walk-In & Reach-In Closets
    h: ['Walk-In Closets Nashville TN', 'Custom Walk-In Closets', 'Walk-In Closet Systems', 'Reach-In Closet Systems', 'Walk-In Closet Designers', 'Luxury Closets, Honest Prices', 'Islands, Drawers & Lighting', C.walkin, C.reachin, C.d3d, C.half, C.no40, C.fam, C.rated, C.book],
    d: ['Walk-in and reach-in closets designed free in your home, installed at half the price.', 'Islands, glass-front drawers, lighting and deeper 14″ shelves. See it in 3D first.', 'Walk-ins from $2,500, reach-ins from $1,000, installed by our own team in one day.', 'Luxury walk-in closet systems without the franchise markup. Family-owned in Nashville.'],
  },
  824056892159: { // Custom Pantry
    h: ['Custom Pantries Nashville TN', 'Custom Pantry Shelving', 'Walk-In Pantry Design', 'Pantry Shelving & Storage', 'Pantries From $1,500 Installed', 'Pull-Outs, Drawers & Shelving', 'Built to the Inch, Installed', 'Walk-In & Butler Pantries', 'See Your Pantry in 3D First', C.d3d, C.half, C.no40, C.fam, C.rated, C.book],
    d: ['Custom pantries with pull-outs, deep drawers and shelving, built to the inch.', 'Pantries from $1,500 installed. Free in-home design, one honest price, no games.', 'Family-owned Nashville company, not a franchise. See your pantry in 3D first.', 'Walk-in, butler and reach-in pantries across Middle Tennessee. Free design.'],
  },
};
const adOps = [];
for (const [id, a] of Object.entries(ADS)) {
  if (a.h.length !== 15 || a.d.length !== 4) throw new Error(`ad ${id}: ${a.h.length} headlines / ${a.d.length} descriptions`);
  if (new Set(a.h).size !== 15) throw new Error(`ad ${id}: duplicate headline`);
  for (const h of a.h) if (h.length > 30) throw new Error(`ad ${id}: headline too long (${h.length}): ${h}`);
  for (const d of a.d) if (d.length > 90) throw new Error(`ad ${id}: description too long (${d.length}): ${d}`);
  adOps.push({ update: { resourceName: `customers/${CUSTOMER}/ads/${id}`, responsiveSearchAd: { headlines: a.h.map((text) => ({ text })), descriptions: a.d.map((text) => ({ text })) } }, updateMask: 'responsive_search_ad.headlines,responsive_search_ad.descriptions' });
}
await mutate('/ads:mutate', adOps, 'RSA rewrites');

// -------------------------------------------------------------- ad schedule
const sched = await gaql(`SELECT campaign_criterion.resource_name FROM campaign_criterion WHERE campaign.id = ${CAMP} AND campaign_criterion.type = 'AD_SCHEDULE'`);
if (sched.length) console.log(`ad schedule: ${sched.length} entries already exist — leaving as is`);
else {
  const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
  const schedOps = DAYS.map((dayOfWeek) => ({ create: { campaign: `customers/${CUSTOMER}/campaigns/${CAMP}`, adSchedule: { dayOfWeek, startHour: 6, startMinute: 'ZERO', endHour: 24, endMinute: 'ZERO' } } }));
  await mutate('/campaignCriteria:mutate', schedOps, 'ad schedule 06:00–24:00');
}
console.log(APPLY ? 'done — applied' : 'done — validation only, re-run with --apply');
