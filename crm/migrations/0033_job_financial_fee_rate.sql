-- Per-job payment-processing fee rate (default 3%). NULL falls back to the
-- FEE_RATE default. The processing fee shown in the P&L is the ACTUAL Stripe
-- fees on paid invoices when there are any, otherwise this rate × net.
ALTER TABLE job_financials ADD COLUMN fee_rate REAL;
