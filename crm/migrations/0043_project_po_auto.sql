-- Auto-assign a unique, identifiable PO number to every job. A trigger stamps
-- PO-<zero-padded id> on insert (any code path) unless one was provided, and we
-- backfill every existing job that has none. Still editable per job (e.g. to
-- record a builder/GC-supplied PO instead).
CREATE TRIGGER IF NOT EXISTS trg_project_po_number
AFTER INSERT ON projects
WHEN NEW.po_number IS NULL OR NEW.po_number = ''
BEGIN
  UPDATE projects SET po_number = 'PO-' || printf('%05d', NEW.id) WHERE id = NEW.id;
END;

UPDATE projects SET po_number = 'PO-' || printf('%05d', id)
WHERE po_number IS NULL OR po_number = '';
