-- Windows now carry a product choice and a color/finish — these are the
-- decisions the customer makes window-by-window during the consult. The
-- proposal builder pulls from these when seeding lines, and the installer
-- print view renders them on the worksheet.
ALTER TABLE windows ADD COLUMN product_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE windows ADD COLUMN color      TEXT;
CREATE INDEX IF NOT EXISTS idx_windows_product ON windows(product_id);
