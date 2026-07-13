-- Rename the proposal template's tier headings to plain "Option 1" / "Option 2"
-- and ensure no 3rd option. Affects proposals created going forward (tier titles
-- are snapshotted at creation).
UPDATE document_templates
SET tier_good_title = 'Option 1',
    tier_better_title = 'Option 2',
    tier_best_title = NULL
WHERE kind = 'proposal';
