// Job cost model — MANUAL line items. The gross proposal is all-inclusive (it
// already contains everything the client pays). Every expense is entered by hand
// per job and defaults to $0; the ONLY line that auto-computes is install labor.
//   • materials, shipping, tax, accessories, wall repair, misc  → typed in ($0 default)
//   • install labor  → 10% of the gross, min $350  (auto; editable override)
//   • processing fee → a % of the total or a flat $ amount
//   • discount       → comes out of profit only (client pays net = gross − discount)
//   • profit         = net − (materials + shipping + tax + accessories + wall + misc + labor + fee)
// The deposit is at least 50% of net, grossed up so it still covers card fees.

export const MATERIALS_DIVISOR = 2.10; // default materials markup: charged = materials expense × 2.10 (i.e. materials = price ÷ 2.10).
export const SHIPPING_RATE = 0;        // shipping default 0% (set per job)
export const TAX_RATE = 0;             // taxes default 0% (set per job)
export const LABOR_RATE = 0.10;        // installation labor = 10% of the gross job price (the only non-zero default)
export const MIN_LABOR_CENTS = 35000;  // …but never less than $350
export const FEE_RATE = 0;             // payment-processing fee default 0% (editable per job; actual Stripe fees still apply when recorded)
export const DEPOSIT_FEE_RATE = 0.03;  // processing-fee buffer built into the deposit floor so it still covers hard costs after card fees (~3%)
export const MATERIALS_DISCOUNT_RATE = 0.03;  // manufacturer discount applied to the materials cost when a job opts in (checkbox)

// The formula rates are adjustable per job (stored on job_financials).
// A stored value overrides the default; NULL/absent falls back to the default.
// A divisor of 0 means "no materials" (materials $0); the percentages default 0.
export function ratesFrom(row) {
  const pos = (v, d) => (Number.isFinite(v) && v > 0 ? v : d);
  const frac = (v, d) => (Number.isFinite(v) && v >= 0 ? v : d);
  return {
    divisor:   pos(row && row.materials_divisor, MATERIALS_DIVISOR),
    shipRate:  frac(row && row.shipping_rate, SHIPPING_RATE),
    taxRate:   frac(row && row.tax_rate, TAX_RATE),
    laborRate: frac(row && row.labor_rate, LABOR_RATE),
    feeRate:   frac(row && row.fee_rate, FEE_RATE),
  };
}

// The processing-fee cost for a job. Precedence:
//   1. a MANUAL override (feeAuto===0 with a fee_cents value) — e.g. the small
//      actual ACH fee typed in by hand;
//   2. the ACTUAL Stripe fees collected on paid invoices, if any;
//   3. the estimate (feeRate × net, default 3%).
// One source of truth so the job card, reports and pipeline all agree.
export function processingFee(netCents, feeRate, actualFeeCents, manualCents, feeAuto) {
  if (feeAuto === 0 && Number.isFinite(manualCents)) return Math.max(0, Math.round(manualCents));
  const actual = actualFeeCents || 0;
  if (actual > 0) return actual;
  const rate = (Number.isFinite(feeRate) && feeRate >= 0) ? feeRate : FEE_RATE;
  return Math.round(Math.max(0, netCents || 0) * rate);
}

// Flat markup baked into every customer quote (proposals + estimates). Applied
// to each positive line total on save, so the customer's line prices and totals
// read this much higher — invisibly — and it flows through to contracts,
// deposits and invoices. Discount lines (negative) are not marked up.
export const QUOTE_MARKUP = 1.03; // default 3% (fallback when env unset)

// Configurable markup RATE (a fraction, e.g. 0.03 = 3%) via wrangler [vars]
// QUOTE_MARKUP_RATE. Clamped 0–25%, defaults to 3%. Change the value and
// redeploy to adjust the markup on all new/edited quotes — no code change.
export function quoteMarkupRate(env) {
  const r = parseFloat(env && env.QUOTE_MARKUP_RATE);
  return Number.isFinite(r) && r >= 0 && r <= 0.25 ? r : 0.03;
}
// Mark up a positive line total by `rate` (fraction). Discounts (negative) pass
// through unchanged.
export const markupLine = (cents, rate = QUOTE_MARKUP - 1) => (cents > 0 ? Math.round(cents * (1 + rate)) : cents);

// Only INSTALL LABOR auto-derives from the price (10% of gross, min $350).
// Materials, shipping, tax, accessories, wall repair and misc are entered by
// hand per job, so they are 0 here. Kept as {materials,shipping,tax,labor} so
// existing callers (the deposit floor, the API) keep working.
export function computeBreakdown(priceCents, rates) {
  const r = rates || {};
  const laborRate = Number.isFinite(r.laborRate) ? r.laborRate : LABOR_RATE;
  const price = Math.max(0, Math.round(priceCents || 0));
  const labor = price > 0 ? Math.max(Math.round(price * laborRate), MIN_LABOR_CENTS) : 0; // %, min $350
  return { materials: 0, shipping: 0, tax: 0, labor };
}

// The deposit collected up front. Two rules, whichever is larger:
//   • at least 50% of what the client pays (net), and
//   • never less than the up-front hard costs — materials + shipping + taxes
//     (figured from the gross) — GROSSED UP so that, after payment-processing
//     fees are skimmed off the deposit, the money that lands still covers those
//     hard costs. This is what guarantees the deposit pays for materials + fees.
// Capped at the net so it can't exceed the total. Pass netCents when it differs
// from the gross (a discount); otherwise net defaults to the gross.
export function depositForTotal(priceCents, netCents, rates) {
  const gross = Math.max(0, Math.round(priceCents || 0));
  const net = (netCents != null && netCents > 0) ? Math.round(netCents) : gross;
  if (net <= 0) return 0;
  const b = computeBreakdown(gross, rates);
  const hardCosts = b.materials + b.shipping + b.tax;
  // Gross up the hard-cost floor by the processing-fee rate so the deposit, net
  // of card fees, still covers materials + shipping + taxes. Use the job's own
  // fee rate when set, otherwise the default card buffer.
  const feeRate = (rates && Number.isFinite(rates.feeRate) && rates.feeRate > 0) ? rates.feeRate : DEPOSIT_FEE_RATE;
  const hardCostsWithFee = feeRate < 1 ? Math.ceil(hardCosts / (1 - feeRate)) : hardCosts;
  return Math.min(net, Math.max(Math.round(net * 0.5), hardCostsWithFee));
}

// Merge a stored job_financials row (manual overrides) over the formula
// defaults. `defaultGrossCents` is the pre-discount (gross) price — the cost
// basis. `defaultDiscountCents` is the discount that comes out of profit only.
// Client pays NET = gross − discount; profit = net − expenses. Pass row=null
// when there's no saved row.
export function resolveFinancials(defaultGrossCents, defaultDiscountCents, row) {
  const priceOverridden = row && row.price_auto === 0 && row.price_cents != null;
  const gross = priceOverridden ? row.price_cents : (defaultGrossCents || 0);
  const rates = ratesFrom(row);
  const f = computeBreakdown(gross, rates);   // labor only

  const val = (k) => (row && Number.isFinite(row[k]) ? Math.max(0, row[k]) : 0);

  // Revenue breakdown of the all-inclusive gross — informational only (does NOT
  // add to what the client pays). Net to client = gross − discount.
  const materialsCharged   = val("materials_charged_cents");
  const accessoriesCharged = val("accessories_charged_cents");
  const wallCharged        = val("wall_charged_cents");

  // Manual expense line items — taken exactly as stored, default $0. Only install
  // labor auto-derives (10% of gross, min $350).
  const materials   = val("materials_cents");
  const mfrDiscount = val("manufacturer_discount_cents");     // reduces the materials expense only
  const materialsNet = Math.max(0, materials - mfrDiscount);
  const shipping    = val("shipping_cents");
  const tax         = val("tax_cents");
  const accessories = val("accessories_cents");
  const wall        = val("wall_expense_cents");   // wall repair — a plain expense; its revenue is inside the gross
  const misc        = val("misc_cents");
  const laborManual = row && row.labor_auto === 0 && row.labor_cents != null;
  const labor       = laborManual ? Math.max(0, row.labor_cents) : f.labor;

  const discountOverridden = row && row.discount_auto === 0 && row.discount_cents != null;
  const discount  = Math.max(0, discountOverridden ? row.discount_cents : (defaultDiscountCents || 0));

  const net = gross - discount;   // gross is all-inclusive; the discount comes out of profit
  const expenses = materialsNet + shipping + tax + accessories + wall + misc + labor;
  return {
    price_cents: gross,        // gross / cost basis (all-inclusive)
    discount_cents: discount,  // dollar discount, out of profit
    net_cents: net,            // what the client pays
    closet_net_cents: net,
    // Revenue breakdown (informational).
    materials_charged_cents: materialsCharged, accessories_charged_cents: accessoriesCharged, wall_charged_cents: wallCharged,
    // Expenses.
    materials_cents: materials, manufacturer_discount_cents: mfrDiscount, materials_net_cents: materialsNet,
    shipping_cents: shipping, tax_cents: tax,
    accessories_cents: accessories, misc_cents: misc, labor_cents: labor,
    wall_expense_cents: wall,
    // Back-compat: wall is now a plain expense (no separate revenue line).
    wall_total_cents: 0, wall_profit_cents: 0,
    expenses_cents: expenses,
    profit_cents: net - expenses,
    price_auto: row ? (row.price_auto !== 0) : true,
    discount_auto: row ? (row.discount_auto !== 0) : true,
    labor_auto: row ? (row.labor_auto !== 0) : true,
    // Back-compat flags (line items are manual now).
    materials_auto: false, shipping_auto: false, tax_auto: false,
    materials_discount: false,
    materials_divisor: rates.divisor, shipping_rate: rates.shipRate, tax_rate: rates.taxRate,
    labor_rate: rates.laborRate,
    fee_rate: rates.feeRate,
    fee_auto: row ? (row.fee_auto !== 0) : true,
    fee_manual_cents: (row && row.fee_cents != null) ? row.fee_cents : null,
    min_labor_cents: MIN_LABOR_CENTS,
  };
}
