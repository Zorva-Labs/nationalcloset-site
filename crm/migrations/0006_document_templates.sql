-- National Closet Company CRM — Editable document templates
-- Apply via: source ~/.env && CLOUDFLARE_API_KEY=$CLOUDFLARE_API_KEY CLOUDFLARE_EMAIL=$CLOUDFLARE_EMAIL \
--   npx wrangler@latest d1 execute nationalcloset-crm --remote --file=crm/migrations/0006_document_templates.sql

-- ----------------------------------------------------------------
-- document_templates: editable boilerplate for contracts, proposals,
-- estimates. Replaces the hardcoded constants in /functions/api/*.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT NOT NULL,                    -- contract | proposal | estimate
  subkind         TEXT,                             -- contract: custom_order|install_only|repair|service_call
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,
  -- All optional — kind decides which fields apply
  intro           TEXT,
  scope_html      TEXT,
  terms_html      TEXT,
  notes_customer  TEXT,
  -- Proposal-specific:
  tier_good_title    TEXT,
  tier_better_title  TEXT,
  tier_best_title    TEXT,
  -- Estimate-specific:
  valid_days      INTEGER,
  -- Contract-specific:
  estimated_install_window TEXT,
  -- Audit
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doctpl_kind ON document_templates(kind, subkind, is_default);

-- ----------------------------------------------------------------
-- Seed the templates that were previously hardcoded as constants.
-- ----------------------------------------------------------------

-- Contract: custom_order (default)
INSERT OR IGNORE INTO document_templates (id, kind, subkind, name, is_default, intro, terms_html, estimated_install_window) VALUES
  (1, 'contract', 'custom_order', 'Custom Order — standard', 1,
   'This agreement is between National Closet Company (Gallatin, TN) and the customer below for the supply and installation of custom window treatments at the project address listed.',
   '<h3>Materials &amp; Manufacture</h3>
<p>All custom window treatments listed in this agreement are made-to-order. Manufacturer lead times typically run two to six weeks from order placement. We will keep you informed of any changes to the schedule.</p>
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
<p>National Closet Company may photograph completed installations for portfolio and marketing use. Customers who prefer not to have their home photographed should note this here or notify us before install day.</p>',
   'Weeks 4–6 from contract execution');

-- Contract: install_only (default)
INSERT OR IGNORE INTO document_templates (id, kind, subkind, name, is_default, intro, terms_html, estimated_install_window) VALUES
  (2, 'contract', 'install_only', 'Install Only · BYO Blinds — standard', 1,
   'This agreement is between National Closet Company (Gallatin, TN) and the customer below for the professional installation of window treatments supplied by the customer at the project address listed.',
   '<h3>Scope of Service</h3>
<p>This is an <strong>install-only</strong> agreement. National Closet Company will install window treatments that the customer has purchased separately from another retailer (e.g. Lowes, Home Depot, Costco, Blinds.com, IKEA, Amazon, manufacturer-direct, or builder leftovers). National Closet Company does <em>not</em> supply or warrant the products themselves — only the labor and workmanship of the installation.</p>
<h3>Customer-Supplied Products</h3>
<p>The customer is responsible for ordering the correct quantity, dimensions, mount type, and finishes. National Closet Company will verify dimensions against the openings before drilling. If a product is the wrong size, the customer is responsible for the return / re-order; a service-call fee will apply if National Closet Company must return after the corrected product arrives.</p>
<h3>Damage on Arrival</h3>
<p>If a customer-supplied product is damaged or defective when unboxed, National Closet Company will document the damage and assist with the return claim, but is not responsible for replacement or refund. The retailer''s return policy applies.</p>
<h3>Payment</h3>
<p>No deposit is required for install-only service. Payment in full is due upon completion of installation. We accept check, cash, ACH, Venmo, and Cash App. Card payments incur a 3% convenience fee.</p>
<h3>Workmanship Warranty</h3>
<p>Our installation work is warranted for <strong>ninety (90) days</strong> against defects in workmanship. If a bracket pulls out, a headrail loses its level, or a motor we programmed loses its limits within 90 days of install, we will return and correct the issue at no charge. This warranty does <em>not</em> cover the product itself, which is governed by its original manufacturer warranty (please retain the retailer''s documentation).</p>
<h3>Specialty Hardware</h3>
<p>For installs requiring atypical hardware (toggle anchors in plaster, stud-finder verification, custom shims for out-of-square frames), National Closet Company will provide all standard hardware. Specialty hardware costing over $25 will be itemized separately.</p>
<h3>Site Access &amp; Conditions</h3>
<p>The customer is responsible for providing reasonable site access at the scheduled install time, having all product boxes on site and unopened, and a working environment safe for our installers. Postponements due to inaccessible sites, missing products, or unsafe conditions may incur a re-scheduling fee.</p>
<h3>Cancellation</h3>
<p>The customer may cancel up to 24 hours before the scheduled install window with no penalty. Same-day cancellations are subject to a service-call charge equal to one window install fee.</p>',
   'Scheduled within 1–2 weeks of customer-supplied products arriving on site');

-- Contract: repair (default)
INSERT OR IGNORE INTO document_templates (id, kind, subkind, name, is_default, intro, terms_html, estimated_install_window) VALUES
  (3, 'contract', 'repair', 'Repair / Service Call — standard', 1,
   'This agreement is between National Closet Company (Gallatin, TN) and the customer below for the repair service detailed in the scope of work below.',
   '<h3>Scope of Service</h3>
<p>This is a <strong>repair</strong> agreement. National Closet Company will repair existing window treatments at the customer''s premises as itemized in the scope above. We service any brand — Hunter Douglas, Norman, Somfy, Graber, Levolor, Bali, Lutron, Hampton Bay, builder-grade — and stock common parts on the truck.</p>
<h3>Payment</h3>
<p>Payment is due upon completion of the repair visit. The service-call fee covers the trip and the first 30 minutes of work; additional time and parts are itemized separately. We accept check, cash, ACH, Venmo, and Cash App.</p>
<h3>Workmanship Warranty</h3>
<p>Our repair work is warranted for <strong>ninety (90) days</strong>. If the repaired component fails within 90 days, we will return and re-repair at no charge. The warranty does not cover unrelated failures of the same product.</p>
<h3>Limitation</h3>
<p>If on inspection a repair is impractical or uneconomic (parts no longer manufactured, product structurally compromised, motor end-of-life), National Closet Company will quote replacement and apply the service-call fee toward any subsequent purchase.</p>',
   'Single visit, typically within 1 week');

-- Proposal default
INSERT OR IGNORE INTO document_templates (id, kind, subkind, name, is_default, intro, tier_good_title, tier_better_title, tier_best_title) VALUES
  (4, 'proposal', NULL, 'Three-tier proposal — standard', 1,
   'Thank you for the opportunity to dress your windows. We''ve put together three options below — each one custom-fit to your home. Take your time comparing, and pick what fits.',
   'The Essentials',
   'The Smart-Home Package',
   'The Heirloom Build');

-- Estimate default
INSERT OR IGNORE INTO document_templates (id, kind, subkind, name, is_default, notes_customer, valid_days) VALUES
  (5, 'estimate', NULL, 'Estimate — standard notes', 1,
   'Prices include custom measure, professional install, and a 90-day workmanship warranty. Estimate valid through the date above. Any questions, call or text 629-298-8241.',
   30);
