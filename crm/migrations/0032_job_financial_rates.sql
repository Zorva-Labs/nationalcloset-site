-- Per-job editable cost-model rates. Each is nullable — NULL means "use the
-- business-default formula rate" (2.8 divisor, 5% shipping, 9.75% tax, 15%
-- labor). A saved value overrides the rate for that job's auto-computed lines,
-- so the multiplier and percentages are adjustable per job rather than baked
-- into code. Feeds the same expense/profit math shown on the job card, /calc,
-- proposals and Reports → P&L.
ALTER TABLE job_financials ADD COLUMN materials_divisor REAL;
ALTER TABLE job_financials ADD COLUMN shipping_rate     REAL;
ALTER TABLE job_financials ADD COLUMN tax_rate          REAL;
ALTER TABLE job_financials ADD COLUMN labor_rate        REAL;
