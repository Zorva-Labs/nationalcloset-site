-- A discount given on a booked job, taken off the final payment (Michael,
-- 2026-10-06). It lives on the job, not on an invoice: the job total every
-- bill is figured from is the signed contracts less this, so the final
-- invoice, the completion sweep and Reports all see the lower figure.
-- invoices.discount_cents is the part of it an invoice carries, so the
-- customer's invoice can show the line.
ALTER TABLE projects ADD COLUMN final_discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN final_discount_note TEXT;
ALTER TABLE invoices ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
