-- Pricing is per-unit, not per-square-foot. Zero out the price_per_sqft_cents
-- column on every product so the catalog picker and lifecycle math stops
-- combining dimensions into pricing. base_price_cents is now the only price
-- a product has. Dimensions are still captured on every line but only for
-- ordering reference — they no longer affect cost.
UPDATE products SET price_per_sqft_cents = 0;
