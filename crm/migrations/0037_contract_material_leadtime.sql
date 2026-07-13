-- Update material lead time (2–4 wk → 4–8 wk) and the "schedule once materials
-- arrive" language on the manufactured-goods contract templates. REPLACE is
-- idempotent (the old sentence is gone after the first run). Affects contracts
-- created going forward. install_only (customer-supplied) and repair are unchanged.
UPDATE document_templates
SET estimated_install_window = '4–8 weeks for materials (holidays, shipping and unforeseen delays may affect timing); repairs and installation scheduled once materials arrive',
    terms_html = REPLACE(
      terms_html,
      'Custom components are typically manufactured within 2&ndash;4 weeks of the deposit, after which installation is scheduled.',
      'Custom materials typically take 4 to 8 weeks to be manufactured and delivered after the deposit is received, depending on holidays, shipping, supplier lead times and other unforeseen circumstances. Once all materials have arrived, National Closet Company will schedule any repairs and the installation.'
    )
WHERE kind = 'contract' AND subkind IN ('custom_order', 'wallprep');
