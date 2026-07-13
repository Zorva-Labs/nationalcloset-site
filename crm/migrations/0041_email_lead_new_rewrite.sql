-- Rewrite the initial new-lead reach-out email for a warmer tone + clearer CTA.
UPDATE email_templates
SET body_text = 'Hi {{first_name}},

Thanks so much for reaching out about your {{interest}} project — I''d love to help bring it to life!

The best next step is a free, no-pressure in-home consultation. I''ll take exact measurements, bring finish and hardware samples, and design options tailored to your space and budget — right there with you, from economy to extravagant.

It takes about 30 to 45 minutes, with zero obligation. What day and time works best for you this week or next? Just reply to this email, or call or text me at 629-298-8241, and we''ll get you on the calendar.

Looking forward to meeting you,

Michael Blair
National Closet Company
629-298-8241
nationalclosetco.com',
    updated_at = datetime('now')
WHERE kind = 'lead_new' AND name = 'New lead — initial reach-out';
