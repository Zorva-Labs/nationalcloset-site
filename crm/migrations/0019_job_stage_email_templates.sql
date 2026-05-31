DELETE FROM email_templates WHERE kind IN ('job_booked','job_scheduled','job_installing','job_completed');
INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used, bind_project_status, is_default, is_active) VALUES ('Your project is booked', 'job_booked', 'You''re booked — your custom closet project is confirmed', 'Hi {{first_name}},

Your contract is signed and your custom closet project is officially booked — thank you for choosing National Closet Company!

What happens next:
1. We finalize your design details and order your materials.
2. Once everything is in, we''ll reach out to schedule your installation on a day that works for you.
3. On install day our team installs your new system and walks you through it before we go.

Questions? Reply to this email or call 629-298-8241.', '<p>Hi {{first_name}},</p>
<p>Your contract is signed and your custom closet project is officially <strong>booked</strong> — thank you for choosing National Closet Company!</p>
<p>Here''s what happens next:</p>
<ol style="line-height:1.7;color:#3A362F">
  <li>We finalize your design details and order your materials.</li>
  <li>Once everything is in, <strong>we''ll reach out to schedule your installation</strong> on a day that works for you.</li>
  <li>On install day our team arrives with everything needed, installs your new system, and walks you through it before we go.</li>
</ol>
<p>Questions in the meantime? Just reply to this email or call <a href="tel:+16292988241">629-298-8241</a>.</p>', '["first_name","name","install_date","address","phone"]', 'contracted', 0, 1);
INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used, bind_project_status, is_default, is_active) VALUES ('Your install is scheduled', 'job_scheduled', 'Your closet install is scheduled for {{install_date}}', 'Hi {{first_name}},

Good news — your custom closet installation is scheduled for {{install_date}}.

To help the day go smoothly:
- Please clear out the space and remove items from the area before we arrive.
- Make sure our team has clear access to the installation area.
- Most installs are completed in a single day — we''ll demo everything before we leave.

Need to adjust the date? Reply to this email or call 629-298-8241.', '<p>Hi {{first_name}},</p>
<p>Good news — your custom closet installation is scheduled for <strong>{{install_date}}</strong>.</p>
<p>A few quick things to help the day go smoothly:</p>
<ul style="line-height:1.7;color:#3A362F">
  <li>Please clear out the closet/space and remove any items from the area before we arrive.</li>
  <li>Make sure our team has clear access to the installation area.</li>
  <li>Most installs are completed in a single day — we''ll demonstrate everything before we leave.</li>
</ul>
<p>Need to adjust the date? Reply to this email or call <a href="tel:+16292988241">629-298-8241</a>.</p>', '["first_name","name","install_date","address","phone"]', 'scheduled_install', 0, 1);
INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used, bind_project_status, is_default, is_active) VALUES ('Installation day is here', 'job_installing', 'We''re installing your new closets today', 'Hi {{first_name}},

Today''s the day — our team is installing your new custom closets!

We''ll take care of everything and give you a full walkthrough of your new system once we''re finished. If anything comes up during the install, we''ll be in touch directly.

Questions? Reply here or call 629-298-8241.', '<p>Hi {{first_name}},</p>
<p>Today''s the day — our team is installing your new custom closets! 🛠️</p>
<p>We''ll take care of everything and give you a full walkthrough of your new system once we''re finished. If anything comes up during the install, we''ll be in touch with you directly.</p>
<p>Questions? Reply to this email or call <a href="tel:+16292988241">629-298-8241</a>.</p>', '["first_name","name","install_date","address","phone"]', 'installing', 0, 1);
INSERT INTO email_templates (name, kind, subject, body_text, body_html, variables_used, bind_project_status, is_default, is_active) VALUES ('All done — thank you!', 'job_completed', 'Your new closets are complete — thank you!', 'Hi {{first_name}},

Your custom closet installation is complete — we hope you love your new space as much as we loved building it for you!

A few final notes:
- If you notice anything that needs attention, just let us know — we stand behind our work.
- Loved the experience? A quick review or a referral means the world to a local, family-owned business.

Thank you for trusting National Closet Company. Reply anytime or call 629-298-8241.', '<p>Hi {{first_name}},</p>
<p>Your custom closet installation is <strong>complete</strong> — we hope you love your new space as much as we loved building it for you!</p>
<p>A few final notes:</p>
<ul style="line-height:1.7;color:#3A362F">
  <li>If you notice anything that needs attention, just let us know — we stand behind our work.</li>
  <li>Loved the experience? A quick review, or a referral to friends and family, means the world to a local, family-owned business.</li>
</ul>
<p>Thank you for trusting National Closet Company. Reply anytime or call <a href="tel:+16292988241">629-298-8241</a>.</p>', '["first_name","name","install_date","address","phone"]', 'completed', 0, 1);
