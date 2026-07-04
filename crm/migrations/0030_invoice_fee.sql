-- The actual Stripe processing fee charged on an invoice's payment (from the
-- charge's balance transaction). Card and Klarna carry a real fee; ACH is small;
-- check/cash/manual are $0. Surfaced as a "Processing fee" cost line in the
-- job's expenses & profit so margin reflects what was actually netted.
ALTER TABLE invoices ADD COLUMN fee_cents INTEGER NOT NULL DEFAULT 0;
