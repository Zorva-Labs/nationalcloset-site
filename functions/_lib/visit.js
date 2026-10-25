// Where a lead came from — the visit behind every form submission.
//
// Every lead carries its traffic source, on the `leads` row and in the lead
// mail (Michael, 2026-10-24: "all forms are supposed to send the traffic info
// with the lead form info"; Three Stone's office asked for it first, 2026-10-23,
// beside the visitor's own "How did you hear about us?", not instead of it).
//
// The edge middleware (traffic-kit) stashes the entry context of every visit in
// a first-party session cookie (`ts_src`, set on the first hit and never
// overwritten — first touch wins). Any same-origin POST carries it back, which
// is how a lead three pages deep still knows it came from an ad, with no
// script, no identifier and nothing an ad blocker can intercept. The rest is
// what the edge knows about the request itself (request.cf). No IP address is
// read or stored anywhere in this file.
//
// Read by /api/lead (the row and the mail), /api/pv-event (the tap-to-call and
// form beacons) and, on a site whose form posts somewhere else, /api/visit.
// `_middleware.js` keeps its own copy of the cookie's shape on purpose: it is
// the hot path on every request and stays self-contained. The columns are
// migrations/lead_source.sql. One copy: ~/site-kit/form/functions/_lib/visit.js
// (`node ~/site-kit/bin/add-lead-source.mjs <site>` rolls it onto a live site).

/* The entry context, or {} when there is no cookie — a visit that began before
   the cookie existed, a browser that blocks them, or a post that never loaded a
   page of the site at all. */
export function entryContext(request) {
  try {
    const raw = request.headers.get('cookie') || '';
    const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith('ts_src='));
    if (!hit) return {};
    const v = JSON.parse(decodeURIComponent(hit.slice('ts_src='.length)));
    return {
      channel: typeof v.c === 'string' ? v.c.slice(0, 40) : null,
      referrer: typeof v.r === 'string' && v.r ? v.r.slice(0, 120) : null,
      gclid: v.g ? 1 : 0,
      landing: typeof v.l === 'string' ? v.l.slice(0, 200) : null,
      device: typeof v.d === 'string' ? v.d.slice(0, 12) : null,
      firstSeen: typeof v.t === 'string' ? v.t.slice(0, 40) : null,
      utmSource: typeof v.s === 'string' ? v.s.slice(0, 60) : null,
      utmMedium: typeof v.m === 'string' ? v.m.slice(0, 60) : null,
    };
  } catch {
    return {};
  }
}

/* The browser and platform, from the same user-agent the page view already
   reads. Coarse on purpose: the version numbers change weekly, tell a business
   owner nothing, and make the string more identifying than it needs to be. */
export function browserOf(ua) {
  const s = (ua || '');
  if (/\bEdg\//.test(s)) return 'Edge';
  if (/\bOPR\/|\bOpera\b/.test(s)) return 'Opera';
  if (/\bSamsungBrowser\//.test(s)) return 'Samsung Internet';
  if (/\bFirefox\//.test(s)) return 'Firefox';
  if (/\bCriOS\//.test(s)) return 'Chrome (iOS)';
  if (/\bChrome\//.test(s)) return 'Chrome';
  if (/\bSafari\//.test(s)) return 'Safari';
  return null;
}

export function osOf(ua) {
  const s = (ua || '');
  if (/\bWindows NT\b/.test(s)) return 'Windows';
  if (/\biPhone\b|\biPad\b|\biPod\b/.test(s)) return 'iOS';
  if (/\bMac OS X\b/.test(s)) return 'macOS';
  if (/\bAndroid\b/.test(s)) return 'Android';
  if (/\bCrOS\b/.test(s)) return 'ChromeOS';
  if (/\bLinux\b/.test(s)) return 'Linux';
  return null;
}

/* Same rule as the middleware's, so a lead and its page view never disagree
   about the device. Only used when the cookie is missing. */
export function deviceOf(ua) {
  const s = (ua || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|windows phone/.test(s)) return 'mobile';
  return 'desktop';
}

/* How long they were on the site before they converted: "10 min after
   arriving", "28 hr after arriving". */
export function sinceArrival(firstSeen, now = Date.now()) {
  if (!firstSeen) return null;
  const t = Date.parse(firstSeen);
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((now - t) / 60000);
  if (mins < 0) return null;
  if (mins < 1) return 'under a minute after arriving';
  if (mins < 60) return `${mins} min after arriving`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr after arriving`;
  return `${Math.round(hrs / 24)} days after arriving`;
}

/* Everything known about the visit a lead came out of. Nothing here can fail
   a lead: every value is optional and every reader below handles null. */
export function visitOf(request) {
  const ua = request.headers.get('user-agent') || '';
  const cf = request.cf || {};
  const src = entryContext(request);
  return {
    channel: src.channel || null,
    referrerHost: src.referrer || null,
    gclid: src.gclid || 0,
    landing: src.landing || null,
    device: src.device || deviceOf(ua),
    firstSeen: src.firstSeen || null,
    utmSource: src.utmSource || null,
    utmMedium: src.utmMedium || null,
    browser: browserOf(ua),
    os: osOf(ua),
    language: (request.headers.get('accept-language') || '').split(',')[0].slice(0, 12) || null,
    geoCity: (cf.city || '').slice(0, 80) || null,
    geoRegion: (cf.region || '').slice(0, 60) || null,
    geoPostal: (cf.postalCode || '').slice(0, 12) || null,
    metro: String(cf.metroCode || '').slice(0, 8) || null,
    timezone: (cf.timezone || '').slice(0, 40) || null,
    isp: (cf.asOrganization || '').slice(0, 80) || null,
    asn: Number(cf.asn) || null,
    country: cf.country || null,
  };
}

/* The visit as `leads` columns (migrations/lead_source.sql). `geo_*` is the edge's estimate of where the connection was, kept
   apart from city/state/zip, which are what the customer typed. */
export const visitRow = (v) => ({
  channel: v.channel, referrer_host: v.referrerHost, gclid: v.gclid, landing: v.landing, device: v.device,
  first_seen: v.firstSeen, utm_source: v.utmSource, utm_medium: v.utmMedium, browser: v.browser, os: v.os,
  language: v.language, geo_city: v.geoCity, geo_region: v.geoRegion, geo_postal: v.geoPostal, metro: v.metro,
  timezone: v.timezone, isp: v.isp, asn: v.asn,
});

/* Puts the visit on a lead row that is already saved. Its own statement, so it
   works whatever shape the endpoint's INSERT has, and it never throws: a table
   without the columns (migrations/lead_source.sql not applied) keeps the lead
   and logs why. */
export async function saveVisit(db, id, v) {
  if (!db || id == null) return false;
  const row = visitRow(v);
  const cols = Object.keys(row);
  try {
    await db.prepare(`UPDATE leads SET ${cols.map((c, i) => `${c} = ?${i + 1}`).join(', ')} WHERE id = ?${cols.length + 1}`)
      .bind(...cols.map((c) => row[c]), id).run();
    return true;
  } catch (e) {
    console.error('[lead] the visit was not saved on the row', (e && e.message) || e);
    return false;
  }
}

/* The classifier's own labels (functions/_middleware.js) are the stored
   value; a few are said differently to a reader, and these are exactly the
   renames /traffic makes (public/traffic/index.html → chName), so the mail and
   the dashboard never call one channel two things (traffic-kit CLAUDE.md).
   Anything not listed is printed as the classifier wrote it. */
export const CHANNEL_WORDS = { 'Google (organic)': 'Google search', 'AI search': 'AI assistants', Direct: 'Direct/ChatGPT', 'Facebook/Instagram': 'Facebook or Instagram' };
export const channelWords = (c) => (c ? CHANNEL_WORDS[c] || c : '');

/* " · Google Ads" for the end of a subject line, so a shared inbox can sort on
   the source without opening anything. */
export const sourceTag = (v) => (v && v.channel ? ` · ${channelWords(v.channel)}` : '');

/* The "Where this lead came from" block, as [label, value] rows. `form` is the
   page the form was sent from. Every line with nothing behind it is left out
   rather than printed empty; Source is always there ("Unknown" when no cookie
   came back). */
export function sourceRows(v, { form = '' } = {}) {
  const took = sinceArrival(v.firstSeen);
  const campaign = [v.utmSource, v.utmMedium].filter(Boolean).join(' / ');
  const deviceLine = [v.device ? v.device[0].toUpperCase() + v.device.slice(1) : '',
    [v.browser, v.os].filter(Boolean).join(' on ')].filter(Boolean).join(' · ');
  const area = [[v.geoCity, v.geoRegion].filter(Boolean).join(', '), v.geoPostal].filter(Boolean).join(' ');
  return [
    ['Source', v.channel ? `${channelWords(v.channel)}${v.gclid ? ' — arrived on an ad click' : ''}` : 'Unknown'],
    ...(campaign ? [['Campaign', campaign]] : []),
    ...(v.referrerHost ? [['Referred by', v.referrerHost]] : []),
    ...(v.landing ? [['Landed on', `${v.landing}${took ? ` · sent the form ${took}` : ''}`]] : []),
    ...(form ? [['Form on', form]] : []),
    ...(deviceLine ? [['Device', deviceLine]] : []),
    ...(area ? [['Their area (estimated)', `${area}${v.country && v.country !== 'US' ? `, ${v.country}` : ''}`]] : []),
    ...(v.isp ? [['Connection', v.isp]] : []),
    ...(v.timezone ? [['Time zone', v.timezone]] : []),
    ...(v.language ? [['Language', v.language]] : []),
  ];
}

/* Michael, 2026-10-23: most of what lands in Direct is ChatGPT. An AI
   assistant that opens a link from its app, or a person who pastes one, sends
   no referrer at all, so the edge has nothing to classify and the visit falls
   to Direct — the AI search channel only ever catches the share that does send
   one. Said on the lead itself and on /traffic, so nobody reads Direct as
   "they already knew us". Unknown is explained wherever it can appear. */
export function sourceNote(v) {
  if (v.channel === 'Direct') return 'Direct/ChatGPT means their browser sent no referrer. Most of that is now an AI assistant — ChatGPT and the like send none when a link is opened from the app or pasted — along with typed addresses, bookmarks, texts and QR codes.';
  if (!v.channel) return 'Unknown means no visit cookie came back with the form, so the edge never saw this visit begin: the page had been sitting open since before the browser was last closed (the cookie lasts the session, the open tab does not), the browser keeps no cookies — some in-app browsers don\'t — or the form was posted without loading a page of the site first.';
  return '';
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The block for the plain-text part of the mail. */
export function sourceText(v, opts) {
  const note = sourceNote(v);
  return ['Where this lead came from', ...sourceRows(v, opts).map(([k, val]) => `${k}: ${val}`), ...(note ? ['', note] : [])].join('\n');
}

/* The block for the HTML part, in the same table style as the lead's own rows. */
export function sourceHtml(v, opts) {
  const note = sourceNote(v);
  return `<p style="font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#6B6560;margin:26px 0 10px;border-top:1px solid #E7E3DE;padding-top:18px">Where this lead came from</p>
<table style="border-collapse:collapse;width:100%;font-size:14px">${sourceRows(v, opts).map(([k, val]) =>
    `<tr><td style="padding:7px 12px 7px 0;color:#6B6560;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:7px 0;color:#1A1919;white-space:pre-wrap">${esc(val)}</td></tr>`).join('')}</table>${note ? `
<p style="font-size:12px;line-height:1.6;color:#6B6560;margin:12px 0 0">${esc(note)}</p>` : ''}`;
}
