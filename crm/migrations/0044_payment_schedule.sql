-- New payment policy: 50% up front (or at least what covers materials +
-- shipping), 25% due when the install is scheduled, 25% due the day of install.
-- Replaces the old two-payment "deposit at signing / balance at completion"
-- wording in the contract terms.
--
-- Only the custom-materials contracts (custom_order, wallprep) carry the
-- schedule — install_only/repair have no material outlay to cover.

UPDATE document_templates
SET terms_html = replace(
      terms_html,
      '<h3>Deposit &amp; Payment</h3>
<p>A non-refundable deposit is due upon signing this Agreement; manufacturing and scheduling begin only after the deposit is received. The remaining balance is due in full upon completion of installation.</p>',
      '<h3>Payment Schedule</h3>
<p>The total contract price is paid in three installments:</p>
<ul>
<li><strong>50% due at signing</strong> (the &ldquo;Deposit&rdquo;) &mdash; or, if greater, the amount required to cover the materials and shipping for this order. Manufacturing and scheduling begin only after the Deposit is received.</li>
<li><strong>25% due when installation is scheduled</strong> &mdash; invoiced once all materials have arrived and the install date is set.</li>
<li><strong>25% due the day of installation.</strong></li>
</ul>
<p>The Deposit is non-refundable except as described under Right to Cancel below. The Customer may pay any installment early, or pay the Agreement in full, at any time.</p>'
    ),
    updated_at = datetime('now')
WHERE kind = 'contract' AND subkind = 'custom_order';

UPDATE document_templates
SET terms_html = replace(
      terms_html,
      '<h3>Deposit &amp; Payment</h3>
<p>A non-refundable deposit covering materials, shipping and applicable taxes is due upon signing this Agreement; manufacturing and scheduling begin only after the deposit is received. The remaining balance is due in full upon completion of installation.</p>',
      '<h3>Payment Schedule</h3>
<p>The total contract price is paid in three installments:</p>
<ul>
<li><strong>50% due at signing</strong> (the &ldquo;Deposit&rdquo;) &mdash; or, if greater, the amount required to cover the materials and shipping for this order. Manufacturing and scheduling begin only after the Deposit is received.</li>
<li><strong>25% due when installation is scheduled</strong> &mdash; invoiced once all materials have arrived and the install date is set.</li>
<li><strong>25% due the day of installation.</strong></li>
</ul>
<p>The Deposit is non-refundable except as described under Right to Cancel below. The Customer may pay any installment early, or pay the Agreement in full, at any time.</p>'
    ),
    updated_at = datetime('now')
WHERE kind = 'contract' AND subkind = 'wallprep';
