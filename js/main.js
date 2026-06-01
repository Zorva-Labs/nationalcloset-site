/* National Closet Company — interactions */
(function () {
  "use strict";

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

      function done() {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
        if (success) {
          form.style.display = "none";
          success.classList.add("show");
          success.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }

      var fd = new FormData(form);
      var payload = {
        name: (fd.get("name") || "").toString(),
        phone: (fd.get("phone") || "").toString(),
        email: (fd.get("email") || "").toString(),
        interest: (fd.get("project") || "").toString(),
        address_street: (fd.get("street") || "").toString(),
        address_city: (fd.get("city") || "").toString(),
        address_state: (fd.get("state") || "").toString(),
        address_zip: (fd.get("zip") || "").toString(),
        message: (fd.get("msg") || "").toString(),
        company: (fd.get("company") || "").toString(), // honeypot
        source: "website" + (location.pathname === "/" ? "" : location.pathname)
      };
      if (payload.company) { done(); return; } // bot — accept silently
      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) {
          if (!r.ok) { try { r.text().then(function (t) { console.warn("lead save failed", r.status, t); }); } catch (_) {} }
        })
        .catch(function (err) { console.warn("lead save error", err); })
        .then(done); // show success regardless so the user is never blocked
    });
  });

  /* ---------- Current year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();

/* ===== Site-wide paper plane: flies down the page on scroll with a dotted trail ===== */
(function () {
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 1024) return;
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "skyfly"); svg.setAttribute("aria-hidden", "true");
    var defs = document.createElementNS(NS, "defs");
    var clip = document.createElementNS(NS, "clipPath"); clip.setAttribute("id", "skyfly-clip");
    var clipRect = document.createElementNS(NS, "rect");
    clipRect.setAttribute("x", "0"); clipRect.setAttribute("y", "0"); clipRect.setAttribute("width", "0"); clipRect.setAttribute("height", "0");
    clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);
    var ghost = document.createElementNS(NS, "path"); ghost.setAttribute("class", "skyfly__ghost"); svg.appendChild(ghost);
    var trail = document.createElementNS(NS, "path"); trail.setAttribute("class", "skyfly__trail"); trail.setAttribute("clip-path", "url(#skyfly-clip)"); svg.appendChild(trail);
    document.body.appendChild(svg);
    var plane = document.createElement("div"); plane.className = "skyfly__plane"; plane.setAttribute("aria-hidden", "true");
    plane.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    document.body.appendChild(plane);

    var W = 0, H = 0, ticking = false, wp = [];
    // Per-load randomness so the flight pattern is different every visit
    // (kept stable across rebuilds within the same session).
    var JIT = []; for (var jj = 0; jj < 128; jj++) JIT.push(Math.random() * 2 - 1);
    var AMP = 0.08 + Math.random() * 0.12;       // random weave width (8–20% of W)
    var SIDE = Math.random() < 0.5 ? -1 : 1;     // random first direction
    // Waypoints: the focal points we want the plane to guide the eye toward,
    // in top-to-bottom order (headings, the hero form, the process steps,
    // testimonials, CTAs). The plane swoops through these as you scroll.
    function waypoints(W, H) {
      var sel = ".hero__copy h1, .hero__form .form-card, section h2, .fp-node__dot, .tcard, .cta-band__inner, .phero h1, .prose h2, .post-card";
      var sx = window.pageXOffset || 0, sy = window.pageYOffset || 0, raw = [];
      document.querySelectorAll(sel).forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        raw.push({ x: r.left + r.width / 2 + sx, y: r.top + r.height / 2 + sy });
      });
      raw.sort(function (a, b) { return a.y - b.y; });
      var pts = [], lastY = -1e9, idx = 0;
      for (var i = 0; i < raw.length; i++) {
        var p = raw[i];
        if (pts.length && p.y - lastY < 60) continue;          // one focal point per Y band (x must be single-valued)
        p.x += SIDE * JIT[idx % JIT.length] * AMP * W;          // randomized horizontal weave
        p.x = Math.max(W * 0.12, Math.min(W * 0.88, p.x));
        pts.push(p); lastY = p.y; idx++;
      }
      if (!pts.length) pts = [{ x: W * 0.5, y: 0 }];
      if (pts[0].y > 120) pts.unshift({ x: W * 0.3, y: 0 });
      pts.push({ x: pts[pts.length - 1].x, y: H + 1 });        // extend to the bottom
      return pts;
    }
    // The plane's x at a document y — smoothstep between the bracketing focal
    // points, so it eases toward (settles on) each one as you scroll past.
    function planeXAt(y) {
      var p = wp; if (!p.length) return W * 0.5;
      if (y <= p[0].y) return p[0].x;
      for (var i = 0; i < p.length - 1; i++) {
        if (y <= p[i + 1].y) {
          var span = (p[i + 1].y - p[i].y) || 1;
          var t = (y - p[i].y) / span; if (t < 0) t = 0; else if (t > 1) t = 1;
          var e = t * t * (3 - 2 * t);
          return p[i].x + (p[i + 1].x - p[i].x) * e;
        }
      }
      return p[p.length - 1].x;
    }
    function build() {
      // Collapse our own overlay BEFORE measuring so the full-height SVG can't
      // inflate the document's scrollHeight (which would feed back and grow H).
      svg.setAttribute("height", 0); svg.style.height = "0px";
      plane.style.display = "none";
      W = document.documentElement.clientWidth;
      H = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      plane.style.display = "";
      svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.style.width = W + "px"; svg.style.height = H + "px";
      wp = waypoints(W, H);
      // Trail = the plane's route expressed as x(y), sampled — dotted.
      var step = 12, d = "M " + planeXAt(0).toFixed(1) + " 0";
      for (var y = step; y <= H; y += step) d += " L " + planeXAt(y).toFixed(1) + " " + y;
      ghost.setAttribute("d", d); trail.setAttribute("d", d);
      clipRect.setAttribute("width", W);
      update();
    }
    function update() {
      ticking = false;
      if (!wp.length) return;
      var vh = window.innerHeight;
      var sc = window.pageYOffset || document.documentElement.scrollTop || 0;
      var max = H - vh, prog = max > 0 ? Math.min(1, Math.max(0, sc / max)) : 0;
      // Keep the plane ON SCREEN: it rides ~34%–62% down the viewport (drifting
      // gently lower as you scroll) and weaves horizontally toward the current
      // focal point, leaving the dotted trail above it.
      var band = 0.34 + 0.28 * prog;
      var py = Math.max(0, Math.min(H, sc + vh * band));
      var px = planeXAt(py);
      var py2 = Math.min(H, py + 10), px2 = planeXAt(py2);
      var ang = Math.atan2(py2 - py, px2 - px) * 180 / Math.PI; // tangent: down + lean toward the weave
      plane.style.transform = "translate(" + px + "px," + py + "px) translate(-50%,-50%) rotate(" + ang + "deg)";
      clipRect.setAttribute("height", Math.max(0, py));
    }
    function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
    var rt;
    function onResize() { clearTimeout(rt); rt = setTimeout(build, 200); }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", function () { setTimeout(build, 120); setTimeout(build, 600); });
    build();
  } catch (e) { /* never break the page over a flourish */ }
})();
