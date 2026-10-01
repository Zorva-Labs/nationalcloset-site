"""/privacy (2026-09-27): what this site, the forms and the customer system keep, read from the code.

Built with the page factory like every other page (chrome.page()), so the header, drawer, footer and
mobile bar match the rest of the site. Run from anywhere: python3 tools/site-build/stage5_privacy.py
It writes privacy.html and nothing else; the footer link to it is part of stage4.py's chrome sweep.

Every sentence is something the code does. Change the page when the code changes:
  the forms and what a lead row keeps    functions/api/contact.js, contact-address.js, js/main.js (no self-booking since 2026-09-29)
  the mail                               functions/_lib/email.js, lead-ack.js, appointment-reminders.js,
                                         consult-brief.js, review-requests.js, email-sync.js (docs/automations.md)
  contracts, invoices, files             functions/api/public/contract/, invoice/ (Stripe), R2 FILES
  the tags                               js/main.js track(), user_data; scripts/ads-offline-conversions.mjs (docs/tracking.md)
  the edge log and the beacon            functions/_middleware.js (ALLOWED_COUNTRIES), /api/pv-time (docs/traffic.md)
  the cookie names                       G-EJEDXZZWJN (the gtag loader in every page), AW-18306256681 (js/main.js GADS_ID), the pixel
  Cloudflare Web Analytics               injected by Cloudflare on the live domain, allowed by _headers' CSP (not in the repo)
  browser storage                        js/main.js ncc_attr (localStorage)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chrome import ROOT, SITE, page, phero, webpage, breadcrumb

os.chdir(ROOT)

TITLE = 'Privacy Policy | National Closet Company'
DESC = ('What National Closet Company keeps from its forms, design visits, contracts and invoices, the Google and Meta '
        'tags on this site, and how to reach us.')
assert 30 <= len(TITLE) <= 60 and 120 <= len(DESC) <= 160, (len(TITLE), len(DESC))

A = 'class="inline" target="_blank" rel="noopener"'

body = '<article>\n' + phero(
    [('Home', '/#top'), ('Privacy', None)], 'Your information', 'Privacy policy',
    'What this website and our customer system keep when you visit, ask for a price or a design visit, or pay an '
    'invoice, and who else sees it.') + f'''

<section class="section section--tight">
  <div class="wrap">
    <div class="prose">

      <p>This is the privacy policy of National Closet Company for nationalclosetco.com and for the proposal, contract and invoice pages we send you.</p>

      <h2>When you ask for a price or a design visit</h2>
      <p>Our price forms ask for your name and a phone number. After that you can add your email, the space you want built, your address and a note.</p>
      <p>Along with what you type, the site keeps the page you sent it from, how you first found us (the page you landed on, the site that sent you, and any ad click id or campaign tags), your browser&rsquo;s user-agent line, a one-way hash of your IP address, and the Google Analytics ids of your visit.</p>
      <p>All of it goes into our own customer system, which runs on Cloudflare. We use it to get back to you, to send your design and your price, and to run your job.</p>

      <h2>Email, both ways</h2>
      <p>We write to you from hello@nationalclosetco.com through Google Workspace: a welcome note once we have your email, the confirmation of your design visit once we set it up with you, a reminder on the morning of your visit, your proposal, contract and invoices, and, after a design visit or a finished job, a request for a Google review. Mail you send to hello@ is filed in our customer system with your record.</p>
      <p>On the morning of a design visit or a measure, each team member going gets an email with your name, phone, email, address, rooms and notes.</p>

      <h2>Proposals, contracts and invoices</h2>
      <p>Each one has its own private link. When you sign a contract, we record the name you type, your email, the signature you draw, the time, your browser&rsquo;s user-agent line and a one-way hash of your IP address.</p>
      <p>You pay an invoice on its page through Stripe. Your card details go to Stripe, not to us, under <a {A} href="https://stripe.com/privacy">Stripe&rsquo;s privacy policy</a>. Design drawings and other files for your project are stored with it on Cloudflare.</p>

      <h2>Google and Meta</h2>
      <p>The site runs Google Analytics, the Google Ads tag and the Meta Pixel. They see the pages you view, and they&rsquo;re told when you tap to call or text, when you get a ballpark price, and when a request is saved. When a request is saved, the page also gives the Google tag your email, phone number and name, for Google Ads&rsquo; enhanced conversions, which match a request to the ad click behind it. When we book your design visit, we report it to Google Analytics against your visit, so Google Ads can count it if an ad brought you.</p>
      <p>Each of them sets cookies of its own. Google Analytics (<code>G-EJEDXZZWJN</code>) sets <code>_ga</code> and <code>_ga_EJEDXZZWJN</code>; the Google Ads tag (<code>AW-18306256681</code>) sets <code>_gcl_au</code>, and <code>_gcl_aw</code> after a click on one of our ads; the Meta Pixel sets <code>_fbp</code>, and <code>_fbc</code> after a click on a Facebook or Instagram ad. Google handles its data under <a {A} href="https://policies.google.com/privacy">its privacy policy</a> and Meta under <a {A} href="https://www.facebook.com/privacy/policy/">its own</a>. <a {A} href="https://tools.google.com/dlpage/gaoptout">Google&rsquo;s opt-out add-on</a> turns off Google Analytics, and blocking this site&rsquo;s cookies in your browser limits all three.</p>

      <h2>Our own visit log</h2>
      <p>For every page a visitor in the United States opens, the site notes the page, the site or ad that sent them, any campaign tags, and the state and country their connection is in. No IP address is stored there, and nothing that names anyone. The page also reports how many seconds it stayed open.</p>
      <p>Visits from outside the United States are turned away, and the country Cloudflare reports for your connection is what decides it.</p>

      <h2>What your browser keeps</h2>
      <ul class="bullets">
        <li><code>ncc_attr</code>, in local storage: the first page you landed on, the site that sent you and, after an ad click, its click id and campaign tags. It goes with a form so your request is credited to what brought you, and it stays until you clear this site&rsquo;s data.</li>
      </ul>

      <h2>Other services the site uses</h2>
      <ul class="bullets">
        <li>Cloudflare hosts the site and our customer system. Its Turnstile check reads signals from your browser to tell a person from a spam program before a form is sent. On the live site it also adds a small script of its own to each page, Cloudflare Web Analytics, which reports how quickly the page loaded, and which page it was, back to Cloudflare; it sets no cookies.</li>
        <li>Most pages load their typefaces from Google Fonts, so Google sees your IP address when your browser fetches them.</li>
        <li>&ldquo;Text a photo&rdquo; opens your phone&rsquo;s messages. The text reaches our phone through your carrier, not through this site.</li>
      </ul>

      <h2>Asking about your information</h2>
      <p>To see what we hold about you, or to have it corrected or deleted, email <a class="inline" href="mailto:hello@nationalclosetco.com">hello@nationalclosetco.com</a> or call <a class="inline" href="tel:+16292988241">629-298-8241</a>.</p>
      <p>Last updated September 28, 2026.</p>

    </div>
  </div>
</section>
</article>
'''

html = page('privacy', TITLE, DESC, '/img/hero-closet-og.jpg', body,
            [webpage('privacy', 'Privacy Policy', DESC, '/img/hero-closet-og.jpg'),
             breadcrumb([('Home', SITE + '/'), ('Privacy', SITE + '/privacy')])])
open('privacy.html', 'w', encoding='utf-8').write(html)
print('privacy.html written')
