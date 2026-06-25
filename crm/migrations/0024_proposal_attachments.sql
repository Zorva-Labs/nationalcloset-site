-- Job-drawing PDFs attached to a proposal. Stored in R2 (binding FILES); this
-- table holds the metadata. project_id is copied from the proposal so the files
-- "follow the client into the job folder" (shown on the job screen too).
CREATE TABLE IF NOT EXISTS proposal_attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id  INTEGER NOT NULL,
  project_id   INTEGER,
  filename     TEXT NOT NULL,
  r2_key       TEXT NOT NULL,
  content_type TEXT,
  size_bytes   INTEGER,
  uploaded_by  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prop_attach_proposal ON proposal_attachments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_prop_attach_project  ON proposal_attachments(project_id);

-- Extra details promised to the client (shown on the proposal + job screen).
ALTER TABLE proposals ADD COLUMN job_notes TEXT;
-- Customer initials confirming the attached drawings are of their project.
ALTER TABLE proposals ADD COLUMN drawings_initials TEXT;
ALTER TABLE proposals ADD COLUMN drawings_confirmed_at TEXT;
