-- Internal, staff-only notes on a job. Mirrors lead_notes so the two behave
-- the same way (timestamped, attributed, newest-first, cascade on delete).
--
-- NOT to be confused with proposals.job_notes, which is CUSTOMER-FACING — it
-- prints on the proposal and is a promise to the client. This table is the
-- opposite: private running commentary for the crew (calls, delays, damaged
-- material, gate codes, "customer wants the drawers switched", etc.) and is
-- never rendered on any customer-visible page or document.
CREATE TABLE IF NOT EXISTS project_notes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  author      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id, created_at DESC);
