-- Rewrite the two-option proposal intro for clarity. Affects proposals created
-- going forward (intro is snapshotted at creation).
UPDATE document_templates
SET intro = 'Thank you for the opportunity to design your project. Below are two options to choose from. Option 1 is our design-and-install service: we build and professionally install your new system, while you handle the prep — removing the existing shelving and taking care of any patching and painting at your discretion beforehand. Option 2 is fully turnkey: we remove the existing shelving or cabinets, patch and freshly paint the area where they were, then design, build, and install your new system — nothing for you to do. Simply pick the one that fits.'
WHERE kind = 'proposal' AND subkind = 'custom';
