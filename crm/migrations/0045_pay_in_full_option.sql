-- Surface "pay in full" as a real, stated option alongside the 50/25/25
-- schedule rather than a trailing clause. Splits the closing paragraph of the
-- Payment Schedule section from 0044 into its own Pay In Full paragraph plus
-- the deposit-refundability line.

UPDATE document_templates
SET terms_html = replace(
      terms_html,
      '<p>The Deposit is non-refundable except as described under Right to Cancel below. The Customer may pay any installment early, or pay the Agreement in full, at any time.</p>',
      '<p><strong>Paying in full.</strong> Instead of the schedule above, the Customer may pay the Agreement in full at signing or at any point afterward, and may pay any individual installment early. There is no penalty or added fee for paying early.</p>
<p>The Deposit is non-refundable except as described under Right to Cancel below.</p>'
    ),
    updated_at = datetime('now')
WHERE kind = 'contract' AND subkind IN ('custom_order', 'wallprep');
