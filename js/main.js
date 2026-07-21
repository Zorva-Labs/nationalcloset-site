/* National Closet Company — interactions */
(function () {
  "use strict";

  /* ---------- Conversion tracking (GA4 live; Google Ads AW- staged) ----------
     GA4 (G-EWFCJ3F5FG) is already loaded in each page's <head>, so track()
     fires the standard GA4 conversion events immediately. To also fire DIRECT
     Google Ads conversions (account 896-812-2786), fill in GADS_ID and the
     per-action labels below — the AW tag then activates automatically. Leave
     them blank to stay GA4-only (import GA4 conversions into Ads instead). */
  var GADS_ID = "AW-18306256681";            // Google Ads Conversion ID (account 896-812-2786)
  var GADS_LABELS = { lead: "UnZvCNvcxMwcEKmejZlE", call: "" };  // "Submit lead form" label set; "call" pending
  if (typeof gtag === "function" && GADS_ID) { gtag("config", GADS_ID); }

  /* ---------- Lead attribution ----------
     Where the lead came from has to be read off the LANDING url and carried
     until they submit — almost nobody converts on the first pageview, and by
     then the ?gclid=... is long gone from the address bar. We stash it and send
     it in the form payload.

     Last-paid-click wins: a fresh gclid/utm overwrites whatever was stored, but
     an organic page view in between never clears it. */
  var ATTR_KEY = "ncc_attr";
  function captureAttribution() {
    try {
      var qs = new URLSearchParams(location.search);
      var gclid = qs.get("gclid") || qs.get("wbraid") || qs.get("gbraid");
      var utm = {};
      ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
        var v = qs.get(k); if (v) utm[k] = v;
      });
      var isPaidHit = !!gclid || !!utm.utm_source;
      var stored = null;
      try { stored = JSON.parse(localStorage.getItem(ATTR_KEY) || "null"); } catch (e) {}
      if (!isPaidHit) {
        // Organic/direct hit — keep any earlier ad click, but record the first
        // landing page + referrer if we have nothing at all yet.
        if (stored) return;
        stored = { landing_page: location.href.slice(0, 500), referrer: (document.referrer || "").slice(0, 500) || null, ts: Date.now() };
      } else {
        stored = {
          gclid: gclid || null,
          utm_source: utm.utm_source || (gclid ? "google" : null),
          utm_medium: utm.utm_medium || (gclid ? "cpc" : null),
          utm_campaign: utm.utm_campaign || null,
          utm_term: utm.utm_term || null,
          utm_content: utm.utm_content || null,
          landing_page: location.href.slice(0, 500),
          referrer: (document.referrer || "").slice(0, 500) || null,
          ts: Date.now()
        };
      }
      localStorage.setItem(ATTR_KEY, JSON.stringify(stored));
    } catch (e) { /* private mode / storage disabled — attribution is best-effort */ }
  }
  function getAttribution() {
    try { return JSON.parse(localStorage.getItem(ATTR_KEY) || "null") || {}; } catch (e) { return {}; }
  }
  captureAttribution();

  /* ---------- Lead-time urgency (evergreen, zero maintenance) ----------
     The honest constraint isn't scarcity — it's build time. Our contracts
     promise 4-8 weeks for custom materials, and the two completed jobs ran
     24 and 25 days from signing to install. That is always true, so it never
     needs editing, and it's stronger persuasion than a slot count: it makes
     the cost of waiting concrete rather than inventing a shortage.

     The target month is computed from today + 7 weeks (conservative inside
     the contracted 4-8), so the claim stays true in perpetuity and rolls over
     the year end on its own.

     Optional override: set data-slots on the element to switch to real
     scarcity messaging ("3 spots left for July") when that genuinely applies.
     Leave it off and the evergreen version runs. */
  (function initUrgency() {
    var bar = document.getElementById("capacity-bar");
    var out = document.getElementById("capacity-text");
    if (!bar || !out) return;

    var MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
    var raw = (bar.getAttribute("data-slots") || "").trim();
    var slots = raw === "" ? null : parseInt(raw, 10);
    var now = new Date();

    if (slots !== null && isFinite(slots) && slots >= 0) {
      // Manual scarcity override — only shown when a real number is set.
      var thisM = MONTHS[now.getMonth()], nextM = MONTHS[(now.getMonth() + 1) % 12];
      out.innerHTML = slots === 0
        ? "<b>" + thisM + " is fully booked.</b> Now scheduling " + nextM + " installs."
        : "We install a limited number of closets each month — <b>" + slots +
          " spot" + (slots === 1 ? "" : "s") + " left for " + thisM + "</b>.";
    } else {
      // Default: build-time urgency. Never goes stale.
      var target = new Date(now.getTime() + 49 * 86400000);   // +7 weeks
      out.innerHTML = "Custom closets are built to order in <b>4&ndash;8 weeks</b> — " +
        "start your free design now and be organized by <b>" + MONTHS[target.getMonth()] + "</b>.";
    }
    bar.classList.add("is-on");
  })();

  // Map our GA4 event names to standard Meta Pixel events so Facebook gets
  // conversion activity to optimize toward (the pixel otherwise only fires PageView).
  var FB_EVENTS = { generate_lead: "Lead", contact: "Contact" };

  // Fire a GA4 event, the matching Google Ads conversion (when configured), and
  // the matching Meta Pixel event. Each is independent so one being blocked/absent
  // doesn't stop the others. adsParams (optional) is merged into the Ads/Pixel hit.
  function track(eventName, params, adsKey, adsParams) {
    if (typeof gtag === "function") {
      try { gtag("event", eventName, params || {}); } catch (e) {}
      if (GADS_ID && adsKey && GADS_LABELS[adsKey]) {
        var c = { send_to: GADS_ID + "/" + GADS_LABELS[adsKey] };
        if (adsParams) { for (var k in adsParams) { if (Object.prototype.hasOwnProperty.call(adsParams, k)) c[k] = adsParams[k]; } }
        try { gtag("event", "conversion", c); } catch (e) {}
      }
    }
    var fb = FB_EVENTS[eventName];
    if (fb && typeof fbq === "function") {
      try { fbq("track", fb, adsParams || {}); } catch (e) {}
    }
  }

  /* ---------- Step 2: service address ----------
     The form asks for name/phone/email/project only — on a paid click every
     extra field costs conversions. The lead is saved and the conversion has
     already fired by the time this renders, so the address is a bonus: skipping
     it costs us nothing, and we'd have had to ask on the phone anyway. */
  function mountAddressStep(success, token) {
    if (success.querySelector(".addr-step")) return;
    var box = document.createElement("div");
    box.className = "addr-step";
    box.style.cssText = "margin-top:20px;padding-top:18px;border-top:1px solid var(--line,#E4E1DA);text-align:left";
    box.innerHTML =
      '<p style="margin:0 0 12px;font-size:.95rem;color:var(--ink-soft,#3A362F)">' +
        '<strong>One quick thing</strong> — what address is the project at? It helps us plan your visit. ' +
        '<span style="color:var(--muted,#6C665B)">Totally optional.</span></p>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<input class="addr-street" type="text" autocomplete="address-line1" placeholder="123 Main St" style="width:100%;padding:11px 13px;border:1.5px solid var(--line,#E4E1DA);border-radius:8px;font:inherit;font-size:15px;box-sizing:border-box"/>' +
        '<div style="display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1.2fr);gap:8px">' +
          '<input class="addr-city" type="text" autocomplete="address-level2" placeholder="Nashville" style="min-width:0;padding:11px 13px;border:1.5px solid var(--line,#E4E1DA);border-radius:8px;font:inherit;font-size:15px;box-sizing:border-box"/>' +
          '<input class="addr-state" type="text" autocomplete="address-level1" placeholder="TN" maxlength="2" style="min-width:0;padding:11px 13px;border:1.5px solid var(--line,#E4E1DA);border-radius:8px;font:inherit;font-size:15px;box-sizing:border-box"/>' +
          '<input class="addr-zip" type="text" inputmode="numeric" autocomplete="postal-code" placeholder="37203" style="min-width:0;padding:11px 13px;border:1.5px solid var(--line,#E4E1DA);border-radius:8px;font:inherit;font-size:15px;box-sizing:border-box"/>' +
        '</div>' +
        '<button type="button" class="addr-save" style="margin-top:4px;padding:12px 18px;border:0;border-radius:8px;background:var(--clay,#D2683F);color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer">Add address</button>' +
      '</div>';
    success.appendChild(box);

    var btn = box.querySelector(".addr-save");
    btn.addEventListener("click", function () {
      var payload = {
        token: token,
        address_street: box.querySelector(".addr-street").value.trim(),
        address_city: box.querySelector(".addr-city").value.trim(),
        address_state: box.querySelector(".addr-state").value.trim(),
        address_zip: box.querySelector(".addr-zip").value.trim()
      };
      if (!payload.address_street && !payload.address_city && !payload.address_zip) { fadeOut("No problem — we'll grab it when we call."); return; }
      btn.disabled = true; btn.textContent = "Saving…";
      fetch("/api/contact-address", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      }).then(function (r) {
        // The lead is already safe either way, so never alarm them about this.
        fadeOut(r.ok ? "Got it — thank you!" : "Thanks! We'll confirm the address when we call.");
      }).catch(function () { fadeOut("Thanks! We'll confirm the address when we call."); });
    });
    function fadeOut(msg) {
      box.innerHTML = '<p style="margin:0;font-size:.95rem;color:var(--ink-soft,#3A362F)">' + msg + "</p>";
    }
  }

  /* Click-to-call conversion — any tel: link (delegated, capture phase so it
     still counts even if another handler stops propagation). Never blocks the call. */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
    if (a) track("contact", { method: "phone", link_url: a.getAttribute("href") }, "call");
  }, true);

  /* Consultation / "Book" & "Request a Bid" CTA clicks — a funnel signal only
     (GA4, not an Ads conversion), since they just scroll to the on-page form. */
  document.querySelectorAll('a[href="#consult"], a[href="#partner-form"]').forEach(function (a) {
    a.addEventListener("click", function () { track("consult_cta_click", { cta: a.getAttribute("href") }); });
  });

  /* ---------- Nav scroll state ---------- */
  var nav = document.querySelector(".nav");
  var mobicta = document.querySelector(".mobicta");
  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle("scrolled", y > 12);
    if (mobicta) mobicta.classList.toggle("show", y > 560);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile drawer ---------- */
  var burger = document.querySelector(".hamburger");
  var drawer = document.querySelector(".drawer");
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    if (burger) burger.classList.remove("open");
    document.body.style.overflow = "";
    if (burger) burger.setAttribute("aria-expanded", "false");
  }
  if (burger && drawer) {
    burger.addEventListener("click", function () {
      var open = drawer.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", open ? "true" : "false");
      document.body.style.overflow = open ? "hidden" : "";
    });
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeDrawer);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });
  }

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("in");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- Count-up stats ---------- */
  var counters = document.querySelectorAll("[data-count]");
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = (el.getAttribute("data-dec") === "1");
    var dur = 1600, start = null;
    function tick(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      var val = target * eased;
      el.textContent = dec ? val.toFixed(1) : Math.round(val).toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = dec ? target.toFixed(1) : Math.round(target).toLocaleString();
    }
    requestAnimationFrame(tick);
  }
  if ("IntersectionObserver" in window && counters.length) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq__q").forEach(function (q) {
    q.addEventListener("click", function () {
      var item = q.closest(".faq__item");
      var ans = item.querySelector(".faq__a");
      var open = item.classList.toggle("open");
      q.setAttribute("aria-expanded", open ? "true" : "false");
      ans.style.maxHeight = open ? ans.scrollHeight + "px" : "0px";
    });
  });
  window.addEventListener("resize", function () {
    document.querySelectorAll(".faq__item.open .faq__a").forEach(function (a) {
      a.style.maxHeight = a.scrollHeight + "px";
    });
  });

  /* ---------- Lead form -> /api/lead (Resend) ---------- */
  document.querySelectorAll("form[data-lead]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var card = form.closest(".form-card") || form.parentElement;
      var success = card.querySelector(".form-success");
      var btn = form.querySelector('button[type="submit"]');
      var original = btn ? btn.innerHTML : "";
      if (btn) { btn.disabled = true; btn.innerHTML = "Sending…"; }

      function done(token) {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        if (success) {
          form.style.display = "none";
          success.classList.add("show");
          success.scrollIntoView({ behavior: "smooth", block: "center" });
          if (token) mountAddressStep(success, token);
        }
      }
      // Only reached if the lead truly fails to save — surface it so the
      // customer is never told "received" when the request was actually lost.
      function fail() {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        var err = card.querySelector(".form-error");
        if (!err) {
          err = document.createElement("p");
          err.className = "form-error";
          err.setAttribute("role", "alert");
          err.style.cssText = "margin-top:14px;padding:12px 16px;border-radius:8px;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;font-size:14px;line-height:1.5;text-align:left";
          form.appendChild(err);
        }
        err.textContent = "Sorry — we couldn't send your request just now. Please call or text us at 629-298-8241 and we'll take care of you right away.";
        err.style.display = "";
      }

      var fd = new FormData(form);
      var payload = {
        name: (fd.get("name") || "").toString(),
        phone: (fd.get("phone") || "").toString(),
        email: (fd.get("email") || "").toString(),
        interest: (fd.get("project") || "").toString(),
        message: (fd.get("msg") || "").toString(),
        company: (fd.get("company") || "").toString(), // honeypot
        source: "website" + (location.pathname === "/" ? "" : location.pathname)
      };
      // Carry the ad click through with the lead. The server can't read any of
      // this itself — it only ever sees a POST to /api/contact.
      var attr = getAttribution();
      ["gclid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "landing_page", "referrer"].forEach(function (k) {
        if (attr[k]) payload[k] = attr[k];
      });
      if (payload.company) { done(); return; } // bot — accept silently
      function postLead() {
        return fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }).then(function (r) {
          if (!r.ok) throw new Error("http_" + r.status);
          return r.json().catch(function () { return {}; });
        });
      }
      // Show success ONLY when the lead is actually saved. Retry once on a
      // transient failure (e.g. a deploy blip), then surface an error rather
      // than telling the customer "received" on a lead that never saved.
      postLead()
        .catch(function () { return new Promise(function (res) { setTimeout(res, 1000); }).then(postLead); })
        .then(function (res) {
          // Conversion fires only once the lead is actually saved (bots take the
          // honeypot early-return above and never reach here). value/currency
          // match the Ads "Submit lead form" action (1.0 USD). Note this fires
          // BEFORE the address step — the lead is already banked, so a customer
          // who skips the address still counts as a conversion.
          track("generate_lead",
            { value: 1.0, currency: "USD", form_location: payload.source },
            "lead",
            { value: 1.0, currency: "USD" });
          done(res && res.update_token);
        })
        .catch(function (err) { console.warn("lead save failed after retry", err); fail(); });
    });
  });

  /* ---------- Current year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();

/* ===== Process section: paper plane flies through the 4 steps once; dotted trail appears only behind it (CSS-driven) ===== */
(function () {
  try {
    var fp = document.querySelector(".flightpath");
    if (!fp) return;
    var DUR = 14; // seconds — must match the CSS animation-duration on .fpfly__plane
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "fpfly"); svg.setAttribute("aria-hidden", "true");
    var guide = document.createElementNS(NS, "path"); guide.setAttribute("fill", "none"); guide.setAttribute("stroke", "none"); svg.appendChild(guide);
    var dotsG = document.createElementNS(NS, "g"); svg.appendChild(dotsG);
    fp.insertBefore(svg, fp.firstChild);
    var plane = document.createElement("div"); plane.className = "fpfly__plane"; plane.setAttribute("aria-hidden", "true");
    plane.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    fp.appendChild(plane);

    function spline(p) {
      if (p.length < 2) return "";
      var d = "M " + p[0].x.toFixed(1) + " " + p[0].y.toFixed(1);
      for (var i = 0; i < p.length - 1; i++) {
        var p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
        d += " C " + (p1.x + (p2.x - p0.x) / 6).toFixed(1) + " " + (p1.y + (p2.y - p0.y) / 6).toFixed(1)
          + " " + (p2.x - (p3.x - p1.x) / 6).toFixed(1) + " " + (p2.y - (p3.y - p1.y) / 6).toFixed(1)
          + " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
      }
      return d;
    }

    function build() {
      var els = fp.querySelectorAll(".fp-node__dot");
      if (!els.length) return;
      var box = fp.getBoundingClientRect();
      var W = fp.clientWidth, Hh = fp.clientHeight;
      svg.setAttribute("width", W); svg.setAttribute("height", Hh); svg.setAttribute("viewBox", "0 0 " + W + " " + Hh);
      var cs = [];
      els.forEach(function (d) { var r = d.getBoundingClientRect(); cs.push({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, r: r.width / 2 }); });
      var rad = cs[0].r;
      // Detect layout: horizontal row (desktop) vs vertically stacked (mobile).
      var minX = cs[0].x, maxX = cs[0].x, minY = cs[0].y, maxY = cs[0].y;
      cs.forEach(function (c) { if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x; if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y; });
      var vertical = (maxY - minY) > (maxX - minX);
      var last = cs[cs.length - 1];
      var pts;
      if (vertical) {
        // Mobile: glide straight DOWN, just to the right of the stacked step
        // markers (in the gap before the text), weaving gently past each one.
        var ampV = 8;
        pts = [{ x: cs[0].x + rad + 6, y: cs[0].y - rad - 40 }];
        cs.forEach(function (c, i) {
          pts.push({ x: c.x + rad + 6 + (i % 2 === 0 ? -ampV : ampV), y: c.y });
        });
        pts.push({ x: last.x + rad + 6, y: last.y + rad + 40 });
      } else {
        // Desktop: a gentle glide that weaves just above/below each step across
        // the row (no looping).
        var cy = cs[0].y, amp = rad + 12;
        pts = [{ x: cs[0].x - rad - 50, y: cy }];
        cs.forEach(function (c, i) {
          pts.push({ x: c.x, y: cy + (i % 2 === 0 ? -amp : amp) });
        });
        pts.push({ x: last.x + rad + 50, y: cy - rad * 0.6 });
      }
      var d = spline(pts);
      guide.setAttribute("d", d);
      plane.style.setProperty("offset-path", 'path("' + d + '")');
      plane.style.setProperty("-webkit-offset-path", 'path("' + d + '")');
      var len = guide.getTotalLength();
      // Dots along the route; each fades in (via per-dot animation-delay) exactly
      // as the plane — moving linearly over DUR — reaches it, so the trail only
      // ever appears BEHIND the plane.
      while (dotsG.firstChild) dotsG.removeChild(dotsG.firstChild);
      for (var L = 0; L <= len; L += 13) {
        var pt = guide.getPointAtLength(L);
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("class", "fpfly__dot");
        c.setAttribute("cx", pt.x.toFixed(1)); c.setAttribute("cy", pt.y.toFixed(1)); c.setAttribute("r", "2.7");
        c.style.animationDelay = (L / len * DUR).toFixed(2) + "s";
        dotsG.appendChild(c);
      }
    }

    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(build, 200); });
    window.addEventListener("load", function () { setTimeout(build, 120); });
    build();

    // Fly through once, the first time the section comes into view.
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting) { fp.classList.add("is-flying"); io.unobserve(fp); } });
      }, { rootMargin: "0px 0px -14% 0px" });
      io.observe(fp);
    } else { fp.classList.add("is-flying"); }
  } catch (e) { /* never break the page over a flourish */ }
})();
