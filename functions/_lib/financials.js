// Job cost model. The expense breakdown and profit are derived FROM the price:
//   1. materials = price ÷ 2.8
//   2. shipping  = 5%  of materials            (default; editable per job)
//   3. taxes     = 9.75% of (materials+shipping) (default; editable per job)
//   4. labor     = 15% of the gross job price, min $350   (installation)
//   5. profit    = net − (materials + shipping + taxes + labor + misc + fee)
// The deposit covers the up-front hard costs (materials + shipping + taxes) and
// is never less than 50% of the net.

export const MATERIALS_DIVISOR = 2.8;  // materials cost = job total ÷ 2.8
export const SHIPPING_RATE = 0.05;     // shipping = 5% of materials (default)
export const TAX_RATE = 0.0975;        // taxes = 9.75% of (materials + shipping) (default)
export const LABOR_RATE = 0.15;        // installation labor = 15% of the gross job price
export const MIN_LABOR_CENTS = 35000;  // …but never less than $350

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

export function computeBreakdown(priceCents) {
  const price = Math.max(0, Math.round(priceCents || 0));
  const materials = Math.round(price / MATERIALS_DIVISOR);
  const shipping = Math.round(materials * SHIPPING_RATE);
  const tax = Math.round((materials + shipping) * TAX_RATE);
  const labor = price > 0 ? Math.max(Math.round(price * LABOR_RATE), MIN_LABOR_CENTS) : 0; // 15%, min $350
  return { materials, shipping, tax, labor };
}

// The deposit collected up front. Two rules, whichever is larger:
//   • at least 50% of what the client pays (net), and
//   • never less than the up-front hard costs — materials + shipping + taxes
//     (figured from the gross), so the deposit always covers them.
// Capped at the net so it can't exceed the total. Pass netCents when it differs
// from the gross (a discount); otherwise net defaults to the gross.
export function depositForTotal(priceCents, netCents) {
  const gross = Math.max(0, Math.round(priceCents || 0));
  const net = (netCents != null && netCents > 0) ? Math.round(netCents) : gross;
  if (net <= 0) return 0;
  const b = computeBreakdown(gross);
  const hardCosts = b.materials + b.shipping + b.tax;
  return Math.min(net, Math.max(Math.round(net * 0.5), hardCosts));
}

// Merge a stored job_financials row (manual overrides) over the formula
// defaults. `defaultGrossCents` is the pre-discount (gross) price — the cost
// basis. `defaultDiscountCents` is the discount that comes out of profit only.
// Client pays NET = gross − discount; profit = net − expenses. Pass row=null
// when there's no saved row.
export function resolveFinancials(defaultGrossCents, defaultDiscountCents, row) {
  const priceOverridden = row && row.price_auto === 0 && row.price_cents != null;
  const gross = priceOverridden ? row.price_cents : (defaultGrossCents || 0);
  const f = computeBreakdown(gross);

  // Materials: override if set, else the formula value. Shipping/tax, when on
  // auto, derive from the EFFECTIVE materials (so an overridden materials cost
  // flows through) — shipping 5% of materials, tax 9.75% of (materials+shipping).
  // Labor, when on auto, is 15% of the gross job price (NOT of materials).
  const over = (key, auto) => row && row[auto] === 0 && row[key] != null;
  const materials = over("materials_cents", "materials_auto") ? row.materials_cents : f.materials;
  const shipping  = over("shipping_cents", "shipping_auto") ? row.shipping_cents : Math.round(materials * SHIPPING_RATE);
  const tax       = over("tax_cents", "tax_auto") ? row.tax_cents : Math.round((materials + shipping) * TAX_RATE);
  const labor     = over("labor_cents", "labor_auto") ? row.labor_cents : f.labor;
  const misc      = (row && row.misc_cents != null) ? row.misc_cents : 0;

  const discountOverridden = row && row.discount_auto === 0 && row.discount_cents != null;
  const discount  = Math.max(0, discountOverridden ? row.discount_cents : (defaultDiscountCents || 0));

  const expenses = materials + shipping + tax + labor + misc;
  const net = gross - discount;
  return {
    price_cents: gross,        // gross / cost basis
    discount_cents: discount,  // dollar discount, out of profit
    net_cents: net,            // what the client pays
    materials_cents: materials, shipping_cents: shipping, tax_cents: tax, labor_cents: labor, misc_cents: misc,
    expenses_cents: expenses,
    profit_cents: net - expenses,
    price_auto: row ? (row.price_auto !== 0) : true,
    discount_auto: row ? (row.discount_auto !== 0) : true,
    materials_auto: row ? (row.materials_auto !== 0) : true,
    shipping_auto: row ? (row.shipping_auto !== 0) : true,
    tax_auto: row ? (row.tax_auto !== 0) : true,
    labor_auto: row ? (row.labor_auto !== 0) : true,
  };
}
