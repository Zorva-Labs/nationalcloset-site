// Job cost model. The client price is all-inclusive; the expense breakdown and
// profit are derived FROM it (confirmed with the owner):
//   1. remove the 35% markup:  list = price ÷ 1.35   (price = list × 1.35)
//   2. discount tier from the list:  <$2,500 → 20%, $2,500–$4,499.99 → 25%, ≥$4,500 → 30%
//   3. materials = list × (1 − discount)   (the tier discount comes off the list)
//   4. shipping  = 5%   of materials
//      tax       = 9.75% of (materials + shipping)
//      labor     = 15%  of materials
//   5. profit    = price − (materials + shipping + tax + labor + misc)

export const MARKUP_MULTIPLIER = 1.35; // price = list × 1.35 (35% markup on the list)
export const SHIPPING_RATE = 0.05;
export const TAX_RATE = 0.0975;
export const LABOR_RATE = 0.15;

// Tier is keyed off the list (price with the markup removed), not the client price.
export function discountForBase(baseCents) {
  const dollars = (baseCents || 0) / 100;
  if (dollars >= 4500) return 0.30;
  if (dollars >= 2500) return 0.25;
  return 0.20;
}

export function computeBreakdown(priceCents) {
  const price = Math.max(0, Math.round(priceCents || 0));
  const list = price / MARKUP_MULTIPLIER;          // remove the 35% markup → list
  const discount = discountForBase(list);          // tier discount off the list
  const materials = Math.round(list * (1 - discount));
  const shipping = Math.round(materials * SHIPPING_RATE);
  const tax = Math.round((materials + shipping) * TAX_RATE);
  const labor = Math.round(materials * LABOR_RATE);
  return { discount, materials, shipping, tax, labor };
}

// Merge a stored job_financials row (manual overrides) over the formula
// defaults. `defaultGrossCents` is the pre-discount (gross) price — the cost
// basis. `defaultDiscountCents` is the discount that comes out of profit only.
// Client pays NET = gross − discount; profit = net − expenses. Pass row=null
// when there's no saved row.
export function resolveFinancials(defaultGrossCents, defaultDiscountCents, row) {
  const priceOverridden = row && row.price_auto === 0 && row.price_cents != null;
  const gross = priceOverridden ? row.price_cents : (defaultGrossCents || 0);
  const f = computeBreakdown(gross); // expenses are always derived from the gross

  // Materials: override if set, else the formula value. Shipping/tax/labor, when
  // on auto, derive from the EFFECTIVE materials (so an overridden materials cost
  // flows through to them) — not the formula materials.
  const over = (key, auto) => row && row[auto] === 0 && row[key] != null;
  const materials = over("materials_cents", "materials_auto") ? row.materials_cents : f.materials;
  const shipping  = over("shipping_cents", "shipping_auto") ? row.shipping_cents : Math.round(materials * SHIPPING_RATE);
  const tax       = over("tax_cents", "tax_auto") ? row.tax_cents : Math.round((materials + shipping) * TAX_RATE);
  const labor     = over("labor_cents", "labor_auto") ? row.labor_cents : Math.round(materials * LABOR_RATE);
  const misc      = (row && row.misc_cents != null) ? row.misc_cents : 0;

  const discountOverridden = row && row.discount_auto === 0 && row.discount_cents != null;
  const discount  = Math.max(0, discountOverridden ? row.discount_cents : (defaultDiscountCents || 0));

  const expenses = materials + shipping + tax + labor + misc;
  const net = gross - discount;
  return {
    price_cents: gross,        // gross / cost basis
    discount: f.discount,      // tier rate (20/25/30%) — distinct from the dollar discount
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
