-- Distinguish entry pageviews (channel attribution) from internal navigation,
-- so the pageviews table can double as a clean visitor counter (already
-- excludes /crm, bots and non-US by construction in the edge middleware).
ALTER TABLE pageviews ADD COLUMN is_entry INTEGER DEFAULT 1;
