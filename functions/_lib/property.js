// County property records for a lead's or job's address (Michael, 2026-11-20).
//
// Public record only, read from the counties' open parcel services:
//   Davidson   — Metro Nashville's parcel layer, then the Assessor's record card
//                (year built, square footage, beds, baths) through the account
//                number Metro's parcel service gives for the parcel.
//   Sumner     — the state Comptroller's hosted copy with CAMA fields (Dec 2023).
//   Williamson — the county parcel copy the City of Brentwood hosts (no year built).
// Every other county has no open service (the state's statewide layer needs a
// token and TPAD refuses scripts), so the card links to TPAD to look by hand.
//
// The county comes from the Census geocoder; when it can't place the address,
// from the city name. Within the county the address is matched by house number
// and street name, then by a 40 m search around the geocoded point.

const DAVIDSON = "https://maps.nashville.gov/arcgis/rest/services/Cadastral/Parcels/MapServer/0";
const SUMNER = "https://maps.cot.tn.gov/hosting/rest/services/Hosted/SUMNER_Dec2023_Parcels_CAMA_A/FeatureServer/0";
const WILLIAMSON = "https://maps.brentwoodtn.gov/arcgis/rest/services/Hosted/CountyParcels/FeatureServer/0";
const TPAD = "https://assessment.cot.tn.gov/TPAD/";
const UA = { "User-Agent": "NationalClosetCRM/1.0 (property lookup)" };

// Cities in and around the service area → county, for when the geocoder misses.
const CITY_COUNTY = {
  nashville: "Davidson", antioch: "Davidson", hermitage: "Davidson", madison: "Davidson",
  "old hickory": "Davidson", "bellevue": "Davidson", "whites creek": "Davidson", joelton: "Davidson",
  "belle meade": "Davidson", "forest hills": "Davidson", "oak hill": "Davidson", "berry hill": "Davidson",
  goodlettsville: "Davidson",
  gallatin: "Sumner", hendersonville: "Sumner", portland: "Sumner", westmoreland: "Sumner",
  "white house": "Sumner", "bethpage": "Sumner", "cottontown": "Sumner", "castalian springs": "Sumner",
  millersville: "Sumner",
  franklin: "Williamson", brentwood: "Williamson", nolensville: "Williamson",
  "thompson's station": "Williamson", "thompsons station": "Williamson", fairview: "Williamson",
  "college grove": "Williamson", arrington: "Williamson",
  "mt. juliet": "Wilson", "mt juliet": "Wilson", "mount juliet": "Wilson", lebanon: "Wilson",
  murfreesboro: "Rutherford", smyrna: "Rutherford", lavergne: "Rutherford", "la vergne": "Rutherford",
  "spring hill": "Maury", columbia: "Maury",
  springfield: "Robertson", greenbrier: "Robertson",
  "ashland city": "Cheatham", kingston: "Cheatham", "pleasant view": "Cheatham",
  dickson: "Dickson",
};

const DIRS = new Set(["N", "S", "E", "W", "NORTH", "SOUTH", "EAST", "WEST", "NE", "NW", "SE", "SW"]);

export function addressKey(a) {
  return [a.street, a.city, a.state || "TN", a.zip].map(s => String(s || "").trim().toUpperCase().replace(/\s+/g, " ").replace(/[.,#]/g, "")).join("|");
}

const SUFFIX = new Set(["RD", "ROAD", "ST", "STREET", "AVE", "AV", "AVENUE", "DR", "DRIVE", "CT", "COURT", "LN", "LANE",
  "BLVD", "BOULEVARD", "PIKE", "PK", "PKWY", "PARKWAY", "WAY", "CIR", "CIRCLE", "PL", "PLACE", "TRL", "TRAIL", "HWY",
  "HIGHWAY", "TER", "TERRACE", "CV", "COVE", "LOOP", "RUN", "PASS", "XING", "CROSSING", "BND", "BEND", "PT", "POINT"]);

// "617 Wedgewood Ave" → { num: "617", words: ["WEDGEWOOD"] }: the street name's
// words before its suffix, directions left out. A unit ("Apt 4") is ignored.
function parseStreet(street) {
  const s = String(street || "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const m = s.match(/^(\d+)[A-Z]?\s+(.*)$/);
  if (!m) return null;
  const all = m[2].split(" ").filter(w => w && !DIRS.has(w));
  const words = [];
  for (const w of all) { if (words.length && SUFFIX.has(w)) break; if (/^(APT|UNIT|STE|SUITE)$/.test(w)) break; words.push(w); }
  return words.length ? { num: m[1], words: words.slice(0, 3) } : null;
}

// A SQL test that `field` holds the street name as whole words: "RED RIVER"
// matches "RED RIVER ROAD 513" but never "REDSTONE DRIVE 513". Words are joined
// by % because Metro's PropStreet carries double spaces.
function nameLike(field, st) {
  const p = st.words.join("%");
  const f = `UPPER(${field})`;
  return `(${f} LIKE '${p} %' OR ${f} LIKE '% ${p} %' OR ${f} LIKE '% ${p}' OR ${f} = '${p}')`;
}

async function getJson(url, params, ms = 8000) {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${u.host} ${r.status}`);
  return r.json();
}

async function arcgis(layer, params) {
  const d = await getJson(layer + "/query", { returnGeometry: "false", f: "json", outFields: "*", ...params });
  if (d.error) throw new Error(`${new URL(layer).host}: ${d.error.message}`);
  return (d.features || []).map(f => f.attributes);
}

async function geocode(a) {
  const line = [a.street, a.city, a.state || "TN", a.zip].filter(Boolean).join(", ");
  try {
    const d = await getJson("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress", {
      address: line, benchmark: "Public_AR_Current", vintage: "Current_Current", layers: "Counties", format: "json",
    });
    const m = d?.result?.addressMatches?.[0];
    if (!m) return null;
    const county = (m.geographies?.Counties?.[0]?.NAME || "").replace(/ County$/, "");
    return { x: m.coordinates.x, y: m.coordinates.y, county, matched: m.matchedAddress };
  } catch { return null; }
}

const near = pt => ({
  geometry: `${pt.x},${pt.y}`, geometryType: "esriGeometryPoint", inSR: "4326",
  spatialRel: "esriSpatialRelIntersects", distance: "40", units: "esriSRUnit_Meter",
});
const int = v => (v === null || v === undefined || v === "" || isNaN(+v) ? null : Math.round(+v));
const iso = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
function usDate(s) { // "2/13/2007" → "2007-02-13"
  const m = String(s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}

// ---- Davidson -------------------------------------------------------------
async function davidson(st, pt) {
  let rows = st ? await arcgis(DAVIDSON, { where: `PropHouse='${st.num}' AND ${nameLike("PropStreet", st)}` }) : [];
  if (!rows.length && pt) rows = (await arcgis(DAVIDSON, near(pt))).filter(r => !st || String(r.PropHouse) === st.num);
  const r = rows[0];
  if (!r) return null;
  const out = {
    source: "davidson", parcel_id: r.STANPAR, owner: r.Owner, prop_address: [r.PropAddr, r.PropCity, r.PropZip].filter(Boolean).join(", "),
    land_use: r.LUDesc, acres: r.Acres ?? null, land_value: int(r.LandAppr), impr_value: int(r.ImprAppr), total_value: int(r.TotlAppr),
    last_sale_date: iso(r.OwnDate), last_sale_price: int(r.SalePrice) || null,
  };
  // The Assessor's record card: year built, size, rooms.
  try {
    const acct = await getJson(`https://maps.nashville.gov/parcelservice/getassessoraccount/${encodeURIComponent(r.STANPAR)}`);
    if (acct?.accountnumber) {
      out.record_url = `https://portal.padctn.org/OFS/WP/Print/${acct.accountnumber}`;
      const res = await fetch(out.record_url, { headers: UA, signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const t = (await res.text()).replace(/<[^>]+>/g, "|").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").replace(/(\| ?)+/g, "|");
        const f = label => (t.match(new RegExp(`\\|${label}:\\|([^|]*)\\|`)) || [])[1]?.trim() || null;
        out.year_built = int(f("Year Built"));
        out.sqft = int((f("Square Footage") || "").replace(/,/g, ""));
        out.beds = int(f("Beds"));
        const baths = parseFloat(f("Baths")); const half = parseFloat(f("Half Bath"));
        out.baths = isNaN(baths) ? null : baths + (isNaN(half) ? 0 : half / 2);
        out.last_sale_date = usDate(f("Most Recent Sale Date")) || out.last_sale_date;
        const price = int((f("Most Recent Sale Price") || "").replace(/[$,]/g, ""));
        if (price) out.last_sale_price = price;
      }
    }
  } catch { /* the layer's figures stand */ }
  return out;
}

// ---- Sumner (state copy, Dec 2023) ----------------------------------------
async function sumner(st, pt) {
  let rows = st ? await arcgis(SUMNER, { where: `${nameLike("address", st)} AND address LIKE '% ${st.num}'` }) : [];
  if (!rows.length && pt) rows = (await arcgis(SUMNER, near(pt))).filter(r => !st || String(r.address || "").trim().endsWith(" " + st.num));
  const r = rows[0];
  if (!r) return null;
  // "RED RIVER ROAD 513" → "513 RED RIVER ROAD"
  const a = String(r.address || "").trim().match(/^(.*)\s(\d+)$/);
  return {
    source: "sumner", data_as_of: "Dec 2023", parcel_id: r.gislink, owner: r.owner,
    prop_address: a ? `${a[2]} ${a[1]}` : r.address, year_built: int(r.yrblt) || null, sqft: int(r.sfla) || null,
    acres: r.calc_acre ? Math.round(r.calc_acre * 100) / 100 : null,
    land_value: int(r.landval), impr_value: int(r.impval), total_value: int(r.appraisal),
    last_sale_date: usDate(r.saledate) || (/^\d{4}-\d{2}-\d{2}/.test(String(r.saledate || "").trim()) ? String(r.saledate).trim().slice(0, 10) : null),
    last_sale_price: int(r.price) || null,
    record_url: r.gislink ? `https://assessment.cot.tn.gov/TPAD/Parcel/GIS?gislink=${encodeURIComponent(r.gislink)}` : null,
  };
}

// ---- Williamson (Brentwood's copy of the county parcels) -------------------
async function williamson(st, pt) {
  let rows = st ? await arcgis(WILLIAMSON, { where: `prop_stree LIKE '${st.num} %' AND ${nameLike("prop_stree", st)}` }) : [];
  if (!rows.length && pt) rows = (await arcgis(WILLIAMSON, near(pt))).filter(r => !st || String(r.prop_stree || "").startsWith(st.num + " "));
  const r = rows[0];
  if (!r) return null;
  return {
    source: "williamson", parcel_id: r.gislink || r.parcel_id, owner: [r.owner1, r.owner2].map(s => (s || "").trim()).filter(Boolean).join(" & "),
    prop_address: r.prop_stree, sqft: int(r.sqft_asses) || null, acres: r.acreage ? Math.round(r.acreage * 100) / 100 : null,
    land_value: int(r.land_value), impr_value: int(r.imp_value), total_value: int(r.total_valu),
    last_sale_date: iso(r.pxfer_date), last_sale_price: int(r.considerat) || null,
    record_url: r.url_link && /#\d+$/.test(r.url_link) ? r.url_link : null,
  };
}

const READERS = { Davidson: davidson, Sumner: sumner, Williamson: williamson };

export async function lookupProperty(a) {
  const st = parseStreet(a.street);
  if (!st) return { status: "error", note: "No house number and street to look up." };
  const pt = await geocode(a);
  const county = pt?.county || CITY_COUNTY[String(a.city || "").trim().toLowerCase()] || null;
  const base = { county, search_url: TPAD };
  const read = READERS[county];
  if (!read) {
    return { ...base, status: "no_source",
      note: county ? `${county} County has no open parcel data to read. Look it up by hand on TPAD.` : "The county couldn't be placed from this address." };
  }
  try {
    const rec = await read(st, pt);
    return rec ? { ...base, ...rec, status: "found" } : { ...base, status: "not_found", note: `No ${county} County parcel matched this address.` };
  } catch (e) {
    return { ...base, status: "error", note: String(e.message || e).slice(0, 200) };
  }
}
