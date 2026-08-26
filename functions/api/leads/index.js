import { requireAuth, json } from "../../_lib/auth.js";
import { upsertContact, recordActivity } from "../../_lib/db.js";

const ALLOWED_STATUSES = new Set([
  "new",
  "replied",
  "consult",
  "proposal",
  "booked",
  "installed",
  "lost",
]);

export async function onRequestGet(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const search = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200", 10), 500);

  const where = [];
  const binds = [];
  if (status && ALLOWED_STATUSES.has(status)) {
    where.push(`status = ?${binds.length + 1}`);
    binds.push(status);
  } else {
    // Default view hides terminal statuses — 'booked'/'installed' (the lead is
    // now a Job on /crm/project.html) and 'lost' (dead). The rows stay in D1
    // for history/attribution but are filtered out of the active Leads list and
    // Pipeline kanban by default. Caller can still see them via ?status=lost /
    // ?status=booked or ?include_archived=1.
    const includeArchived = url.searchParams.get("include_archived") === "1";
    if (!includeArchived) {
      where.push(`status NOT IN ('booked', 'installed', 'lost')`);
    }
  }
  if (search) {
    const like = `%${search}%`;
    const i = binds.length + 1;
    where.push(`(name LIKE ?${i} OR email LIKE ?${i + 1} OR phone LIKE ?${i + 2} OR location LIKE ?${i + 3})`);
    binds.push(like, like, like, like);
  }

  const sql = `
    SELECT id, created_at, updated_at, name, phone, email,
           address_street, address_city, address_state, address_zip, location,
           interest, message, source_page, status, assigned_to, quoted_amount_cents,
           utm_source, utm_medium, utm_campaign, gclid, referrer
    FROM leads
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY datetime(created_at) DESC
    LIMIT ${limit}
  `;
  const stmt = binds.length ? context.env.DB.prepare(sql).bind(...binds) : context.env.DB.prepare(sql);
  const { results } = await stmt.all();

  // Quick counts by status for the sidebar
  const counts = await context.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM leads GROUP BY status`
  ).all();
  const byStatus = Object.fromEntries((counts.results || []).map((r) => [r.status, r.n]));

  return json({ leads: results, counts: byStatus });
}

// POST /api/leads — admin manually adds a lead (phone call, walk-in, referral).
// Only name is required; email/phone/etc. are optional. When an email is given
// we also upsert a contact so the lead ties into the customer record.
export async function onRequestPost(context) {
  const guard = await requireAuth(context);
  if (guard instanceof Response) return guard;
  const { DB } = context.env;
  const b = await context.request.json().catch(() => ({}));

  const name = (b.name || "").toString().trim();
  if (!name) return json({ error: "Name is required" }, 400);
  const email = (b.email || "").toString().trim() || null;
  const phone = (b.phone || "").toString().trim() || null;
  const location = (b.location || "").toString().trim() || null;
  const addressStreet = (b.address_street || "").toString().trim() || null;
  const addressCity = (b.address_city || "").toString().trim() || null;
  const addressState = (b.address_state || "").toString().trim() || null;
  const addressZip = (b.address_zip || "").toString().trim() || null;
  const interest = (b.interest || "").toString().trim() || null;
  const message = (b.message || "").toString().trim() || null;
  const status = ALLOWED_STATUSES.has(b.status) ? b.status : "new";

  let contactId = null;
  if (email) {
    try { contactId = await upsertContact(DB, { name, email, phone }); } catch { /* non-fatal */ }
  }

  const r = await DB.prepare(
    `INSERT INTO leads (name, phone, email, location, interest, message, status, source_page, contact_id,
                        address_street, address_city, address_state, address_zip)
     VALUES (?1,?2,?3,?4,?5,?6,?7,'crm-manual',?8,?9,?10,?11,?12) RETURNING id`
  ).bind(name, phone, email, location, interest, message, status, contactId,
         addressStreet, addressCity, addressState, addressZip).first();

  await recordActivity(DB, {
    entityType: "lead", entityId: r.id, action: "created",
    actorKind: "admin", actorId: guard.id, actorName: guard.email,
    details: { source: "crm-manual", status },
  }).catch(() => {});

  return json({ id: r.id });
}
