// POST /api/leads/import — bulk-create leads from a mapped CSV.
//
// The browser parses the CSV and applies the user's column→field mapping, then
// posts plain row objects here in chunks (a few hundred at a time) so no single
// request runs long enough to hit Workers' CPU limit. Each chunk is independent
// and returns its own tally, so a failure part-way through never loses the rows
// that already landed.
//
// Body: { rows: [{name, phone, email, ...}], options: { status, source,
//         skipDuplicates: "none"|"email"|"phone"|"either" } }

import { requireAuth, json } from "../../_lib/auth.js";
import { upsertContact } from "../../_lib/db.js";

// Only these can be written from a CSV. Anything else in the payload is ignored
// — the mapping UI can't be trusted to stay in sync with the schema.
const FIELDS = new Set([
  "name", "phone", "email", "location", "interest", "message",
  "address_street", "address_city", "address_state", "address_zip",
  "status", "assigned_to", "source_page", "created_at",
  "utm_source", "utm_medium", "utm_campaign", "utm_term",
]);
const STATUSES = new Set(["new", "contacted", "replied", "consult", "proposal", "lost"]);
const MAX_ROWS = 500;

const clean = (v, n = 300) => (v == null ? "" : String(v).trim().slice(0, n));
const digits = (s) => clean(s).replace(/[^\d]/g, "");
// Meta exports phones as "p:+17175550123" — drop the prefix, keep the rest.
const cleanPhone = (v) => clean(v).replace(/^p:/i, "").trim();
// Accept an exported timestamp so imported leads keep their real date instead
// of all landing on "today". Returns SQLite-friendly UTC, or null if unparseable.
function toSqlDate(v) {
  const s = clean(v, 40); if (!s) return null;
  const d = new Date(s); if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

// "$1,250.00" / "1250" → cents. Blank or unparseable → null (not 0, so a missing
// value never looks like a real $0 quote).
function toCents(v) {
  const s = clean(v).replace(/[^0-9.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context);
  if (auth instanceof Response) return auth;
  const { DB } = context.env;

  const body = await context.request.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) return json({ error: "rows[] required" }, 400);
  if (body.rows.length > MAX_ROWS) return json({ error: `Max ${MAX_ROWS} rows per request` }, 400);

  const opts = body.options || {};
  const defStatus = STATUSES.has(opts.status) ? opts.status : "new";
  const source = clean(opts.source, 80) || "csv-import";
  const dedupe = ["email", "phone", "either"].includes(opts.skipDuplicates) ? opts.skipDuplicates : "none";

  // Preload existing keys once per chunk rather than querying per row.
  let seenEmail = new Set(), seenPhone = new Set();
  if (dedupe !== "none") {
    const ex = (await DB.prepare(`SELECT email, phone FROM leads WHERE archived_at IS NULL`).all()).results || [];
    for (const r of ex) {
      if (r.email) seenEmail.add(r.email.toLowerCase());
      if (r.phone) seenPhone.add(digits(r.phone));
    }
  }

  const result = { imported: 0, skipped: 0, failed: 0, errors: [], ids: [] };

  for (let i = 0; i < body.rows.length; i++) {
    const raw = body.rows[i] || {};
    const rowNo = Number(raw.__row) || i + 1;   // original CSV line, for error messages
    const f = {};
    for (const k of Object.keys(raw)) if (FIELDS.has(k)) f[k] = clean(raw[k], k === "message" ? 2000 : 300);

    const name = f.name || "";
    if (!name) { result.failed++; result.errors.push({ row: rowNo, error: "missing name" }); continue; }

    const email = f.email ? f.email.toLowerCase() : "";
    const phone = cleanPhone(f.phone);
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      result.failed++; result.errors.push({ row: rowNo, error: `invalid email "${f.email}"` }); continue;
    }

    // Duplicate check against what's already in the CRM *and* earlier rows in
    // this same file (a CSV often repeats a person).
    const eKey = email, pKey = digits(phone);
    const dupE = dedupe === "email" || dedupe === "either";
    const dupP = dedupe === "phone" || dedupe === "either";
    if ((dupE && eKey && seenEmail.has(eKey)) || (dupP && pKey && seenPhone.has(pKey))) {
      result.skipped++; continue;
    }

    const status = STATUSES.has(f.status) ? f.status : defStatus;
    const fullAddress = [f.address_street, [f.address_city, f.address_state].filter(Boolean).join(", "), f.address_zip]
      .filter(Boolean).join(" ");

    try {
      // Only tie a contact when we have an email — upsertContact keys on email,
      // so blank-email rows would all collapse onto one another.
      let contactId = null;
      if (email) {
        contactId = await upsertContact(DB, {
          name, email, phone,
          address: { street: f.address_street || null, city: f.address_city || null,
                     state: (f.address_state || "").toUpperCase().slice(0, 2) || null, zip: f.address_zip || null },
        }).catch(() => null);
      }

      const row = await DB.prepare(
        `INSERT INTO leads
           (name, phone, email, location, interest, message,
            address_street, address_city, address_state, address_zip,
            source_page, status, assigned_to, quoted_amount_cents,
            utm_source, utm_medium, utm_campaign, utm_term, contact_id, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,
                 COALESCE(?20, datetime('now')), COALESCE(?20, datetime('now')))
         RETURNING id`
      ).bind(
        name, phone, email,
        f.location || fullAddress || null, f.interest || null, f.message || null,
        f.address_street || null, f.address_city || null,
        (f.address_state || "").toUpperCase().slice(0, 2) || null, f.address_zip || null,
        f.source_page || source, status, f.assigned_to || null, toCents(raw.quoted_amount),
        f.utm_source || null, f.utm_medium || null, f.utm_campaign || null, f.utm_term || null,
        contactId, toSqlDate(f.created_at),
      ).first();

      result.imported++;
      result.ids.push(row?.id);
      if (eKey) seenEmail.add(eKey);
      if (pKey) seenPhone.add(pKey);
    } catch (e) {
      result.failed++;
      result.errors.push({ row: rowNo, error: String(e?.message || e).slice(0, 160) });
    }
  }

  result.errors = result.errors.slice(0, 50);   // keep the response small
  return json(result);
}
