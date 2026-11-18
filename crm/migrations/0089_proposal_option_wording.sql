-- The one-option proposal's description, reworded to read warmer (Michael,
-- 2026-11-18: "make this sentence more pleasant"). Same facts: the customer
-- clears the space and the old shelving; we don't repair or paint walls.
-- Only unsent drafts carried the old sentence; a sent proposal keeps its words.
UPDATE proposal_tiers
   SET description = 'We design, build and professionally install your new custom system. To get ready for install day, please clear out the space and remove the existing shelving. If you''d like any patching or fresh paint, it''s best done beforehand, since wall repair and painting aren''t part of our service.'
 WHERE instr(description, 'we do not repair or paint walls') > 0
   AND proposal_id IN (SELECT id FROM proposals WHERE status = 'draft');
