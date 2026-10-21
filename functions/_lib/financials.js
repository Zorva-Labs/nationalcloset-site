// Money rules shared by the quotes, contracts and invoices. The CRM keeps no
// cost, labor or profit math (Michael, 2026-10-21: "remove all calculations for
// profit, labor etc..."): the price is what the customer pays, and the deposit
// is half of it.

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

// The deposit collected at signing: 50% of what the client pays (net), with no
// materials floor (Michael, 2026-10-21). Pass netCents when it differs from the
// gross (a discount); otherwise net defaults to the gross.
export function depositForTotal(priceCents, netCents) {
  const gross = Math.max(0, Math.round(priceCents || 0));
  const net = (netCents != null && netCents > 0) ? Math.round(netCents) : gross;
  if (net <= 0) return 0;
  return Math.min(net, Math.round(net * 0.5));
}
