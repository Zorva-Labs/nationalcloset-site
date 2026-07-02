import { requireAuth, json } from "../../_lib/auth.js";
import { genToken, nextSequence, formatDocNumber } from "../../_lib/tokens.js";
import { recordActivity } from "../../_lib/db.js";
import { depositForTotal } from "../../_lib/financials.js";

const TERMS_BY_TYPE = {
  custom_order: `
<h3>Materials &amp; Manufacture</h3>
<p>All custom closets and storage systems listed in this agreement are made-to-order. Manufacturer lead times typically run two to six weeks from order placement. We will keep you informed of any changes to the schedule.</p>

<h3>Deposit &amp; Payment</h3>
<p>A deposit is due at signing to release the order to our manufacturing partners. The deposit covers materials, shipping and applicable taxes; the remaining balance is due at the completion of installation. You can also pay in full at any time. We accept card, bank transfer (ACH), digital wallets and Klarna online, plus check or cash in person, with no added processing fee.</p>

<h3>Measurement &amp; Fit</h3>
<p>National Closet Company will measure all windows on-site and is responsible for the fit of any product we manufacture from those measurements. All windows are measured to the sixteenth of an inch and recorded in this agreement.</p>

<h3>Cancellation</h3>
<p>Custom orders are non-returnable once released to the manufacturer. The customer may cancel within 72 hours of signing without penalty. After 72 hours, the deposit is non-refundable to the extent it covers materials already ordered. National Closet Company reserves the right to cancel and refund the deposit if the project becomes unworkable.</p>

<h3>Warranty</h3>
<p>All products carry the original manufacturer warranty (typically 5–25 years depending on product line). Our installation work is warranted for ninety (90) days against defects in workmanship — we will return and repair at no charge for any install defect reported within that window.</p>

<h3>Site Access &amp; Conditions</h3>
<p>The customer is responsible for providing reasonable site access at the scheduled install time and a working environment safe for our installers (clear paths to windows, pets contained, hazards disclosed). Postponements due to inaccessible sites may incur a re-scheduling fee.</p>

<h3>Photography</h3>
<p>National Closet Company may photograph completed installations for portfolio and marketing use. Customers who prefer not to have their home photographed should note this here or notify us before install day.</p>
`,

  install_only: `
<h3>Scope of Service</h3>
<p>This is an <strong>install-only</strong> agreement. National Closet Company will install closets and storage systems that the customer has purchased separately from another retailer (e.g. Lowes, Home Depot, Costco, Blinds.com, IKEA, Amazon, manufacturer-direct, or builder leftovers). National Closet Company does <em>not</em> supply or warrant the products themselves — only the labor and workmanship of the installation.</p>

<h3>Customer-Supplied Products</h3>
<p>The customer is responsible for ordering the correct quantity, dimensions, mount type, and finishes. National Closet Company will verify dimensions against the openings before drilling. If a product is the wrong size, the customer is responsible for the return / re-order; a service-call fee will apply if National Closet Company must return after the corrected product arrives.</p>

<h3>Damage on Arrival</h3>
<p>If a customer-supplied product is damaged or defective when unboxed, National Closet Company will document the damage and assist with the return claim, but is not responsible for replacement or refund. The retailer's return policy applies.</p>

<h3>Payment</h3>
<p>No deposit is required for install-only service. Payment in full is due upon completion of installation. We accept check, cash, ACH, Venmo, and Cash App. Card payments incur a 3% convenience fee.</p>

<h3>Workmanship Warranty</h3>
<p>Our installation work is warranted for <strong>ninety (90) days</strong> against defects in workmanship. If a bracket pulls out, a headrail loses its level, or a motor we programmed loses its limits within 90 days of install, we will return and correct the issue at no charge. This warranty does <em>not</em> cover the product itself, which is governed by its original manufacturer warranty (please retain the retailer's documentation).</p>

<h3>Specialty Hardware</h3>
<p>For installs requiring atypical hardware (toggle anchors in plaster, stud-finder verification, custom shims for out-of-square frames), National Closet Company will provide all standard hardware. Specialty hardware costing over $25 will be itemized separately.</p>

<h3>Site Access &amp; Conditions</h3>
<p>The customer is responsible for providing reasonable site access at the scheduled install time, having all product boxes on site and unopened, and a working environment safe for our installers. Postponements due to inaccessible sites, missing products, or unsafe conditions may incur a re-scheduling fee.</p>

<h3>Cancellation</h3>
<p>The customer may cancel up to 24 hours before the scheduled install window with no penalty. Same-day cancellations are subject to a service-call charge equal to one window install fee.</p>
`,

  repair: `
<h3>Scope of Service</h3>
<p>This is a <strong>repair</strong> agreement. National Closet Company will repair existing closets and storage systems at the customer's premises as itemized in the scope above. We service any brand — Hunter Douglas, Norman, Somfy, Graber, Levolor, Bali, Lutron, Hampton Bay, builder-grade — and stock common parts on the truck.</p>

<h3>Payment</h3>
<p>Payment is due upon completion of the repair visit. The service-call fee covers the trip and the first 30 minutes of work; additional time and parts are itemized separately. We accept check, cash, ACH, Venmo, and Cash App.</p>

<h3>Workmanship Warranty</h3>
<p>Our repair work is warranted for <strong>ninety (90) days</strong>. If the repaired component fails within 90 days, we will return and re-repair at no charge. The warranty does not cover unrelated failures of the same product.</p>

<h3>Limitation</h3>
<p>If on inspection a repair is impractical or uneconomic (parts no longer manufactured, product structurally compromised, motor end-of-life), National Closet Company will quote replacement and apply the service-call fee toward any subsequent purchase.</p>
`,
};

export async function onRequestGet(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("project_id");
  let sql = `SELECT k.*, p.name AS project_name, c.name AS contact_name, c.email AS contact_email
             FROM contracts k
             JOIN projects p ON p.id = k.project_id
             JOIN contacts c ON c.id = p.contact_id WHERE 1=1`;
  const binds = [];
  if (status) { binds.push(status); sql += ` AND k.status=?${binds.length}`; }
  if (projectId) { binds.push(parseInt(projectId, 10)); sql += ` AND k.project_id=?${binds.length}`; }
  sql += ` ORDER BY k.created_at DESC LIMIT 200`;
  const rows = (await context.env.DB.prepare(sql).bind(...binds).all()).results || [];
  return json({ contracts: rows });
}

export async function onRequestPost(context) {
  const auth = await requireAuth(context); if (auth instanceof Response) return auth;
  const body = await context.request.json().catch(() => ({}));
  if (!body.project_id) return json({ error: "Missing project_id" }, 400);
  const year = new Date().getUTCFullYear();
  const seq = await nextSequence(context.env.DB, `contract-${year}`);
  const number = formatDocNumber("C", year, seq);
  const token = genToken(16);

  // Optionally seed lines from an estimate or proposal tier
  let totalCents = 0;
  let lines = [];
  if (body.estimate_id) {
    const est = await context.env.DB.prepare(`SELECT total_cents FROM estimates WHERE id=?1`).bind(body.estimate_id).first();
    if (est) totalCents = est.total_cents;
    lines = (await context.env.DB.prepare(`SELECT description, room, quantity, unit_price_cents, line_total_cents, position FROM estimate_lines WHERE estimate_id=?1 ORDER BY position, id`).bind(body.estimate_id).all()).results || [];
  } else if (body.proposal_tier_id) {
    const t = await context.env.DB.prepare(`SELECT proposal_id, tier, total_cents FROM proposal_tiers WHERE id=?1`).bind(body.proposal_tier_id).first();
    if (t) {
      totalCents = t.total_cents;
      lines = (await context.env.DB.prepare(`SELECT description, room, quantity, unit_price_cents, line_total_cents, position FROM proposal_tier_lines WHERE tier_id=?1 ORDER BY position, id`).bind(body.proposal_tier_id).all()).results || [];
    }
  }

  const contractType = ["custom_order", "wallprep", "install_only", "repair", "service_call"].includes(body.contract_type) ? body.contract_type : "custom_order";

  // Deposit rules differ by type
  let depositCents;
  if (body.deposit_cents != null) {
    depositCents = parseInt(body.deposit_cents, 10);
  } else if (contractType === "install_only" || contractType === "repair" || contractType === "service_call") {
    depositCents = 0;  // no deposit for service work — paid on completion
  } else {
    depositCents = depositForTotal(totalCents);  // hard costs: materials + shipping + tax
  }

  // Load the default template for this contract type from the editable document_templates table.
  // Fall back to the hardcoded constant if the template was deleted.
  let tplIntro, tplTerms, tplWindow, tplScope = "";
  const tpl = body.template_id
    ? await context.env.DB.prepare(`SELECT * FROM document_templates WHERE id=?1`).bind(body.template_id).first()
    : await context.env.DB.prepare(`SELECT * FROM document_templates WHERE kind='contract' AND subkind=?1 AND is_default=1 ORDER BY id LIMIT 1`).bind(contractType).first();
  if (tpl) {
    tplIntro = tpl.intro;
    tplTerms = tpl.terms_html;
    tplWindow = tpl.estimated_install_window;
    tplScope = tpl.scope_html || "";
  } else {
    const fallbacks = {
      custom_order:   { intro: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the supply and installation of custom closets and storage systems at the project address listed.", window: "Weeks 4–6 from contract execution" },
      install_only:   { intro: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the professional installation of closets and storage systems supplied by the customer at the project address listed.", window: "Scheduled within 1–2 weeks of customer-supplied products arriving on site" },
      repair:         { intro: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the repair service detailed in the scope of work below.", window: "Single visit, typically within 1 week" },
      service_call:   { intro: "This agreement is between National Closet Company (Gallatin, TN) and the customer below for the service call detailed below.", window: "Single visit, scheduled at signing" },
    };
    tplIntro = fallbacks[contractType].intro;
    tplTerms = TERMS_BY_TYPE[contractType] || TERMS_BY_TYPE.custom_order;
    tplWindow = fallbacks[contractType].window;
  }

  const r = await context.env.DB.prepare(
    `INSERT INTO contracts (project_id, estimate_id, proposal_id, number, view_token, status, contract_type, total_cents, deposit_cents,
       intro, scope_html, terms_html, estimated_install_window, author_user_id)
     VALUES (?1,?2,?3,?4,?5,'draft',?6,?7,?8,?9,?10,?11,?12,?13) RETURNING id`
  ).bind(
    body.project_id,
    body.estimate_id || null,
    body.proposal_id || null,
    number, token, contractType, totalCents, depositCents,
    body.intro || tplIntro,
    body.scope_html || tplScope || "",
    body.terms_html || tplTerms,
    body.estimated_install_window || tplWindow,
    auth.id,
  ).first();

  for (const l of lines) {
    await context.env.DB.prepare(
      `INSERT INTO contract_lines (contract_id, description, room, quantity, unit_price_cents, line_total_cents, position)
       VALUES (?1,?2,?3,?4,?5,?6,?7)`
    ).bind(r.id, l.description, l.room || null, l.quantity, l.unit_price_cents, l.line_total_cents, l.position).run();
  }

  await recordActivity(context.env.DB, {
    entityType: "contract", entityId: r.id, action: "created",
    actorKind: "admin", actorId: auth.id, actorName: auth.email,
  });
  return json({ id: r.id, number, view_token: token });
}
