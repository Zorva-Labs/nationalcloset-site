import { requireAuth, json } from "../../../_lib/auth.js";
import { sendStageEmail, STAGE_EMAIL_KIND } from "../../../_lib/stage-emails.js";
import { createInvoice } from "../../../_lib/invoices.js";
import { deleteProjectCascade } from "../../../_lib/cascade.js";

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const project = await context.env.DB
    .prepare(`SELECT p.*, c.name AS contact_name, c.email AS contact_email, c.phone AS contact_phone
              FROM projects p JOIN contacts c ON c.id=p.contact_id WHERE p.id=?1`)
    .bind(id).first();
  if (!project) return json({ error: "Not found" }, 404);
  // Join product info so the print worksheet + windows tab can show product
  // name + retail price without a second round-trip.
  const windows = (await context.env.DB.prepare(
    `SELECT w.*,
            pr.name           AS product_name,
            pr.sku            AS product_sku,
            pr.base_price_cents AS product_price_cents,
            pr.category       AS product_category
       FROM windows w
       LEFT JOIN products pr ON pr.id = w.product_id
      WHERE w.project_id = ?1
      ORDER BY w.position, w.id`
  ).bind(id).all()).results || [];
  const estimates = (await context.env.DB.prepare(`SELECT id, number, status, total_cents, valid_until, created_at FROM estimates WHERE project_id=?1 ORDER BY created_at DESC`).bind(id).all()).results || [];
  const proposals = (await context.env.DB.prepare(`SELECT id, number, status, selected_tier, selected_total_cents, created_at FROM proposals WHERE project_id=?1 ORDER BY created_at DESC`).bind(id).all()).results || [];
  const contracts = (await context.env.DB.prepare(`SELECT id, number, status, total_cents, deposit_cents, deposit_paid, contract_type, view_token, signed_by_customer_at, counter_signed_at, sent_at, created_at FROM contracts WHERE project_id=?1 ORDER BY created_at DESC`).bind(id).all()).results || [];

  // Appointments — directly linked to this project OR matching the contact's
  // email (legacy bookings that pre-date the project_id wiring still attribute
  // via email match). Newest first.
  const appointments = (await context.env.DB.prepare(
    `SELECT id, type, start_at, end_at, duration_min, status, source, name, email, phone, site_address, rooms, notes, created_at
       FROM appointments
      WHERE project_id = ?1
         OR (LOWER(email) = LOWER(?2) AND project_id IS NULL)
      ORDER BY start_at DESC`
  ).bind(id, project.contact_email || "").all()).results || [];

  // Original lead context (interest, message, source, UTM) if this project
  // came from a website inquiry. The lead row stays in D1 even after the
  // job is booked — the Job page is now the surface where it shows up.
  let lead = null;
  let leadNotes = [];
  if (project.lead_id) {
    lead = await context.env.DB.prepare(
      `SELECT id, name, email, phone, interest, message, source_page, utm_source, utm_medium,
              utm_campaign, referrer, created_at, status
         FROM leads WHERE id = ?1`
    ).bind(project.lead_id).first();
    // Admin's hand-typed notes on the lead carry through to the job —
    // the job page surfaces them so nothing the admin captured before
    // contract signing gets lost when the record transitions.
    leadNotes = (await context.env.DB.prepare(
      `SELECT id, body, author, created_at FROM lead_notes WHERE lead_id = ?1 ORDER BY datetime(created_at) DESC`
    ).bind(project.lead_id).all()).results || [];
  }

  // Quick email counts — full thread is on the Messages tab.
  const emailCount = await context.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN direction='in'  THEN 1 ELSE 0 END) AS received,
       MAX(created_at) AS last_at
       FROM email_messages WHERE project_id = ?1`
  ).bind(id).first();

  return json({ project, windows, estimates, proposals, contracts, appointments, lead, lead_notes: leadNotes, email_count: emailCount });
}

export async function onRequestPatch(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const body = await context.request.json().catch(() => ({}));
  const fields = [];
  const binds = [];
  const allowed = ["name","description","site_address","status","install_date"];
  for (const k of allowed) {
    if (body[k] !== undefined) { fields.push(`${k}=?${binds.length+1}`); binds.push(body[k] === "" ? null : body[k]); }
  }
  if (!fields.length) return json({ error: "Nothing to update" }, 400);

  // If the status is changing into a job stage, capture the previous status so
  // we only fire the stage email on a real transition (not a no-op re-save).
  let prevStatus = null;
  if (body.status !== undefined) {
    const cur = await context.env.DB.prepare(`SELECT status FROM projects WHERE id=?1`).bind(id).first();
    prevStatus = cur?.status || null;
  }

  fields.push(`updated_at=datetime('now')`);
  binds.push(id);
  await context.env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id=?${binds.length}`).bind(...binds).run();

  // Notify the client of the new stage (Booked / Scheduled / Installing /
  // Completed) and log it to Messages. Best-effort; runs after the response
  // commits so the CRM stays snappy.
  if (body.status !== undefined && body.status !== prevStatus && STAGE_EMAIL_KIND[body.status]) {
    const p = sendStageEmail(context.env, body.status, id, { id: auth.id, name: auth.email });
    if (context.waitUntil) context.waitUntil(p); else await p;
  }

  // On completion, auto-create + send the final balance invoice (total minus
  // the deposit already invoiced). Dedup prevents a second balance invoice.
  if (body.status === "completed" && prevStatus !== "completed") {
    const inv = createInvoice(context.env, { projectId: id, type: "balance", actor: { id: auth.id, name: auth.email } })
      .catch((e) => console.error("[invoice/balance]", String(e)));
    if (context.waitUntil) context.waitUntil(inv); else await inv;
  }
  return json({ ok: true });
}

// DELETE /api/projects/[id]?purge=1
//
// Default behaviour wipes the project + everything FK-cascade auto-cleans
// (windows, estimates, proposals + their tiers/lines/comments, contracts +
// their lines). Appointments and email_messages have ON DELETE SET NULL, so
// without ?purge they'd stay around as orphans pointing to nothing.
//
// With ?purge=1 we do a "nuke everything related" sweep — appointments,
// email_messages, activity_log entries for the project + descendant
// proposals/contracts, AND the originating lead (with its lead_notes) when
// no other project references it. The contact row is preserved (they may
// have other jobs / be a future repeat customer); the response surfaces a
// counts summary so the UI can show what was actually deleted.
export async function onRequestDelete(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const id = parseInt(context.params.id, 10);
  const url = new URL(context.request.url);
  const purge = url.searchParams.get("purge") === "1";
  const { DB } = context.env;

  // Pull the project's lead_id + contact_id BEFORE we delete it, so we can
  // walk the lead/lead_notes chain after the cascade runs.
  const proj = await DB.prepare(
    `SELECT id, lead_id, contact_id FROM projects WHERE id = ?1`
  ).bind(id).first();
  if (!proj) return json({ error: "Not found" }, 404);

  // Count what we're about to remove for the response summary.
  const summary = {
    windows:       (await DB.prepare(`SELECT COUNT(*) AS n FROM windows WHERE project_id=?1`).bind(id).first())?.n || 0,
    estimates:     (await DB.prepare(`SELECT COUNT(*) AS n FROM estimates WHERE project_id=?1`).bind(id).first())?.n || 0,
    proposals:     (await DB.prepare(`SELECT COUNT(*) AS n FROM proposals WHERE project_id=?1`).bind(id).first())?.n || 0,
    contracts:     (await DB.prepare(`SELECT COUNT(*) AS n FROM contracts WHERE project_id=?1`).bind(id).first())?.n || 0,
    invoices:      (await DB.prepare(`SELECT COUNT(*) AS n FROM invoices WHERE project_id=?1`).bind(id).first())?.n || 0,
    appointments:  (await DB.prepare(`SELECT COUNT(*) AS n FROM appointments WHERE project_id=?1`).bind(id).first())?.n || 0,
    emails:        purge ? (await DB.prepare(`SELECT COUNT(*) AS n FROM email_messages WHERE project_id=?1${proj.lead_id ? " OR lead_id=?2" : ""}`).bind(...(proj.lead_id ? [id, proj.lead_id] : [id])).first())?.n || 0 : 0,
    lead_notes:    0,
    lead_removed:  false,
  };

  // Remove the project and its ENTIRE subtree (contracts+lines, estimates+lines,
  // proposals+tiers/lines/comments, invoices+lines, windows, documents,
  // communications). D1 doesn't enforce FK cascades, so this is explicit.
  await deleteProjectCascade(DB, id, { purge });

  // On a full purge, also remove the originating lead — but only if no OTHER
  // project still references it.
  if (purge && proj.lead_id) {
    const other = await DB.prepare(`SELECT COUNT(*) AS n FROM projects WHERE lead_id=?1`).bind(proj.lead_id).first();
    if (!other?.n) {
      summary.lead_notes = (await DB.prepare(`SELECT COUNT(*) AS n FROM lead_notes WHERE lead_id=?1`).bind(proj.lead_id).first())?.n || 0;
      await DB.prepare(`DELETE FROM activity_log WHERE entity_type='lead' AND entity_id=?1`).bind(proj.lead_id).run();
      await DB.prepare(`DELETE FROM lead_notes WHERE lead_id=?1`).bind(proj.lead_id).run();
      await DB.prepare(`DELETE FROM email_messages WHERE lead_id=?1`).bind(proj.lead_id).run();
      await DB.prepare(`DELETE FROM leads WHERE id=?1`).bind(proj.lead_id).run();
      summary.lead_removed = true;
    }
  }

  return json({ ok: true, purge, summary });
}
