-- Page-instance id so the beacon can report cumulative time multiple times and
-- the server keeps the MAX — instead of locking in the first (often tiny) value.
ALTER TABLE page_engagement ADD COLUMN pvid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pe_pvid ON page_engagement(pvid);
