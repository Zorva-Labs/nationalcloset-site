-- Vendors assigned to a job. The two cost-bearing roles map onto the job's
-- cost model:
--   manufacturer → materials cost (paid up front when the job is ordered)
--   installer    → labor cost     (accounts payable AFTER the job is complete)
-- One vendor per role per job (a job has one manufacturer + one installer).
CREATE TABLE IF NOT EXISTS project_vendors (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  vendor_id  INTEGER NOT NULL,
  role       TEXT NOT NULL,                         -- 'manufacturer' | 'installer'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, role)
);
CREATE INDEX IF NOT EXISTS idx_project_vendors_project ON project_vendors(project_id);
CREATE INDEX IF NOT EXISTS idx_project_vendors_vendor  ON project_vendors(vendor_id);
