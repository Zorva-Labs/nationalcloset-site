// GET /api/public/proposal/[token]  → proposal + tiers + lines + comments
// POST /api/public/proposal/[token]  body: { action: "select_tier" | "accept" | "comment", tier?, name?, body? }
//   accept response: { ok: true, contract_token } — customer should immediately redirect to /contract/?t=…
import { json, hashIp } from "../../../_lib/auth.js";
import { trackView, recordActivity } from "../../../_lib/db.js";
import { createContractFromProposalTier, syncLeadQuotedFromProposal } from "../../../_lib/lifecycle.js";
import { createInvoice } from "../../../_lib/invoices.js";
import { sendEmail, brandedEmail, escapeHtml } from "../../../_lib/email.js";

// A proposal is expired once its 2-day window has passed and it hasn't been
// accepted/declined. Computed live so the customer sees the expired state the
// moment it lapses, even before the cron sweep flips the stored status.
function isExpired(p) {
  if (!p) return false;
  if (p.status === "accepted" || p.status === "declined") return false;
  if (p.status === "expired") return true;
  if (!p.valid_until) return false;
  const s = String(p.valid_until).trim();
  const iso = s.includes("T") ? s : s.replace(" ", "T") + (s.length <= 10 ? "T00:00:00Z" : "Z");
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getTime() <= Date.now();
}

export async function onRequestGet(context) {
  const token = context.params.token;
  const p = await context.env.DB.prepare(
    `SELECT pr.*, pj.name AS project_name, c.name AS contact_name
     FROM proposals pr JOIN projects pj ON pj.id=pr.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE pr.view_token=?1`
  ).bind(token).first();
  if (!p) return json({ error: "Not found" }, 404);
  const tiers = (await context.env.DB.prepare(`SELECT * FROM proposal_tiers WHERE proposal_id=?1 ORDER BY CASE tier WHEN 'good' THEN 1 WHEN 'better' THEN 2 WHEN 'best' THEN 3 END`).bind(p.id).all()).results || [];
  for (const t of tiers) {
    t.lines = (await context.env.DB.prepare(`SELECT * FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`).bind(t.id).all()).results || [];
  }
  const comments = (await context.env.DB.prepare(`SELECT id, tier, author_kind, author_name, body, created_at FROM proposal_comments WHERE proposal_id=?1 ORDER BY created_at ASC`).bind(p.id).all()).results || [];
  const attachments = (await context.env.DB.prepare(`SELECT id, filename, size_bytes FROM proposal_attachments WHERE proposal_id=?1 ORDER BY created_at`).bind(p.id).all()).results || [];
  await trackView(context.env.DB, "proposals", p.id);
  const expired = isExpired(p);
  if (p.status === "sent" && !expired) await context.env.DB.prepare(`UPDATE proposals SET status='viewed' WHERE id=?1`).bind(p.id).run();
  const safe = { ...p, expired }; delete safe.notes_internal; delete safe.author_user_id;
  return json({ proposal: safe, tiers, comments, attachments });
}

export async function onRequestPost(context) {
  const token = context.params.token;
  const body = await context.request.json().catch(() => ({}));
  const p = await context.env.DB.prepare(
    `SELECT pr.*, pj.name AS project_name, pj.id AS proj_id, c.name AS contact_name, c.email AS contact_email
     FROM proposals pr JOIN projects pj ON pj.id=pr.project_id JOIN contacts c ON c.id=pj.contact_id
     WHERE pr.view_token=?1`
  ).bind(token).first();
  if (!p) return json({ error: "Not found" }, 404);
  const ipHash = await hashIp(context.request.headers.get("CF-Connecting-IP"));

  // The customer whose proposal has lapsed can only ask for a fresh one — no
  // selecting a tier or accepting expired pricing.
  const expired = isExpired(p);
  if (body.action === "request_update") {
    const note = String(body.message || "").trim().slice(0, 1000);
    await recordActivity(context.env.DB, {
      entityType: "proposal", entityId: p.id, action: "update-requested",
      actorKind: "customer", actorName: p.contact_name || null,
      details: { ip_hash: ipHash, message: note || null },
    });
    const staff = context.env.STAFF_EMAIL || "hello@nationalclosetco.com";
    const adminUrl = `https://nationalclosetco.com/crm/proposal.html?id=${p.id}`;
    const html = brandedEmail({
      title: "A customer wants an updated proposal.",
      preheader: `${p.contact_name || "A customer"} — ${p.number}`,
      body: `
        <p><strong>${escapeHtml(p.contact_name || "A customer")}</strong> opened an expired proposal (<strong>${escapeHtml(p.number)}</strong> · ${escapeHtml(p.project_name || "")}) and asked for updated pricing.</p>
        ${note ? `<p style="border-left:3px solid #D2683F;padding-left:14px;color:#3A362F">"${escapeHtml(note)}"</p>` : ""}
        <p>Re-open the proposal, refresh the numbers, and resend — that stamps a new 2-day window.</p>`,
      ctaLabel: "Open the proposal",
      ctaUrl: adminUrl,
      signature: false,
    });
    await sendEmail(context.env, { to: staff, subject: `Updated proposal requested — ${p.number}`, html }).catch(() => {});
    return json({ ok: true });
  }
  if (expired && (body.action === "select_tier" || body.action === "accept")) {
    return json({ error: "This proposal has expired. Please request an updated proposal." }, 410);
  }

  if (body.action === "select_tier") {
    if (!["good","better","best"].includes(body.tier)) return json({ error: "Invalid tier" }, 400);
    const t = await context.env.DB.prepare(`SELECT total_cents FROM proposal_tiers WHERE proposal_id=?1 AND tier=?2`).bind(p.id, body.tier).first();
    await context.env.DB.prepare(
      `UPDATE proposals SET selected_tier=?1, selected_total_cents=?2, status='tier_selected', updated_at=datetime('now') WHERE id=?3`
    ).bind(body.tier, t?.total_cents || 0, p.id).run();
    // Push the newly-selected tier amount back to the lead so reporting reflects it
    await syncLeadQuotedFromProposal(context.env.DB, p.id);
    await recordActivity(context.env.DB, {
      entityType: "proposal", entityId: p.id, action: "tier-selected",
      actorKind: "customer", details: { tier: body.tier, ip_hash: ipHash },
    });
    return json({ ok: true });
  }

  if (body.action === "accept") {
    if (!body.name) return json({ error: "Please type your name to accept." }, 400);
    if (!p.selected_tier) return json({ error: "Pick a tier first." }, 400);

    // When drawings are attached, the customer must initial to confirm the
    // drawings are of the project they want before they can accept.
    const attCount = (await context.env.DB.prepare(`SELECT COUNT(*) n FROM proposal_attachments WHERE proposal_id=?1`).bind(p.id).first())?.n || 0;
    const initials = (body.initials || "").trim();
    if (attCount > 0 && !initials) {
      return json({ error: "Please initial to confirm the attached drawings are of your project." }, 400);
    }

    // 1) Mark the proposal accepted
    await context.env.DB.prepare(
      `UPDATE proposals SET status='accepted', accepted_at=datetime('now'), accepted_by_name=?1, accepted_ip_hash=?2,
         drawings_initials=?3, drawings_confirmed_at=CASE WHEN ?3 <> '' THEN datetime('now') ELSE drawings_confirmed_at END,
         updated_at=datetime('now') WHERE id=?4`
    ).bind(body.name, ipHash, initials, p.id).run();
    await recordActivity(context.env.DB, {
      entityType: "proposal", entityId: p.id, action: "accepted",
      actorKind: "customer", actorName: body.name,
      details: { ip_hash: ipHash, tier: p.selected_tier, drawings_confirmed: attCount > 0, initials: initials || null },
    });

    // 2) Auto-create a draft contract from the accepted tier
    let contractToken = null;
    try {
      const result = await createContractFromProposalTier(
        context.env.DB,
        // The proposal row from the earlier query already has all needed fields
        { id: p.id, project_id: p.project_id, number: p.number, selected_tier: p.selected_tier },
        { kind: "customer", name: body.name }
      );
      contractToken = result.view_token;
    } catch (e) {
      // If conversion fails (e.g. tier missing), still return accept success — admin can convert manually
      console.error("auto-convert failed:", e);
    }

    // 3) Pre-create the deposit invoice for the accepted option (no email —
    //    the customer is sent straight to sign, then sees the invoice on screen
    //    as the next booking step). Dedup prevents a second one at booking.
    const invoiceWork = createInvoice(context.env, {
      projectId: p.project_id, type: "deposit", proposalId: p.id, actor: { name: body.name }, send: false,
    }).catch((e) => console.error("[invoice/accept]", String(e)));
    if (context.waitUntil) context.waitUntil(invoiceWork); else await invoiceWork;

    return json({ ok: true, contract_token: contractToken });
  }

  if (body.action === "comment") {
    if (!body.body) return json({ error: "Empty comment" }, 400);
    await context.env.DB.prepare(
      `INSERT INTO proposal_comments (proposal_id, tier, author_kind, author_name, body)
       VALUES (?1, ?2, 'customer', ?3, ?4)`
    ).bind(p.id, body.tier || null, body.name || null, body.body).run();
    await recordActivity(context.env.DB, {
      entityType: "proposal", entityId: p.id, action: "comment-added",
      actorKind: "customer", actorName: body.name || null,
    });
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
}
