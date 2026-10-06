// The traffic dashboard's two National Closet helpers, shared by
// functions/api/traffic/data.js and ads.js: Central's offset for SQLite, and a
// website lead as a row in traffic-kit's `events` shape.

import { centralNow } from "./dates.js";
import { classifyChannel } from "./channel.js";

/* Hours behind UTC in Central right now, from the IANA zone (_lib/dates.js):
   5 in daylight time, 6 from November to March. SQLite is handed it as a
   number, since D1 has no time zones. */
export function centralOffset() {
  return Math.round((Date.now() - Date.parse(centralNow().iso + "Z")) / 3_600_000);
}

/* ---- the website's forms, from `leads` -------------------------------------- */

const OUR_HOST = /(^|\.)nationalclosetco\.com$/i;
const pathOf = (u) => { try { return new URL(u).pathname.replace(/\/+$/, "") || "/"; } catch { return null; } };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/* What brought the lead, by the beacon's rules: the click id or utm kept from
   the landing page first, else the referrer it arrived with (js/main.js keeps
   the first outside one). A referrer from our own pages says nothing. */
function leadChannel(l) {
  const clickId = l.gclid || (/[?&](gclid|gbraid|wbraid)=/.test(String(l.landing_page || "")) ? "1" : null);
  const ref = hostOf(l.referrer);
  return classifyChannel(l.utm_source, clickId, OUR_HOST.test(ref) ? "" : ref);
}

/* A lead row in the kit's `events` shape: a completed form, credited to the
   page the visit began on. source_page is 'website' (the home page's forms) or
   'website/<page>'. */
export function leadEvent(l, off) {
  const page = String(l.source_page || "").replace(/^website\/?/, "");
  const channel = leadChannel(l);
  const local = new Date(Date.parse(String(l.created_at).replace(" ", "T") + "Z") - off * 3_600_000)
    .toISOString().slice(0, 19).replace("T", " ");
  return {
    id: l.id, name: "form_complete", path: `/${page}`.replace(/\/+$/, "") || "/",
    landing: pathOf(l.landing_page), detail: null, country: null, channel,
    referrer_host: hostOf(l.referrer) || null, gclid: channel === "Google Ads" ? 1 : 0,
    created_at: l.created_at, local_time: local, device: null, minutes_to_convert: null,
    utm_source: l.utm_source || null, utm_medium: l.utm_medium || null,
    lead_name: String(l.name || "").trim().slice(0, 80) || undefined,
    lead_what: l.interest ? String(l.interest).slice(0, 80) : undefined,
  };
}
