-- Link projects back to the lead that spawned them, so when a contract is
-- signed we can auto-advance the originating lead to 'won' status.

ALTER TABLE projects ADD COLUMN lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id);
