-- A vendor's job title (Sales Rep, VP of Sales, Account Executive…), separate
-- from the role/category that drives grouping + the job manufacturer/installer
-- slots. Shown on the vendor list for quick scanning.
ALTER TABLE vendors ADD COLUMN title TEXT;

-- Backfill: the first vendors were created with the person's title stuffed into
-- notes — promote that into the new title field and clear those notes.
UPDATE vendors SET title = notes, notes = NULL
 WHERE notes IS NOT NULL AND notes != ''
   AND (email LIKE '%@modularclosets.com' OR email = 'pdonley@yelp.com');
