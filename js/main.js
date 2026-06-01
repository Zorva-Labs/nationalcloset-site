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

    var W = 0, H = 0, len = 0, ticking = false;
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
      var amp = Math.min(W * 0.36, 420), cx = W * 0.5;
      var seg = Math.max(window.innerHeight * 0.85, 560);
      var pts = [], y = 0, i = 0;
      while (y < H + seg) { pts.push([cx + (i % 2 === 0 ? -amp : amp), Math.min(y, H)]); y += seg; i++; }
      var d = "M " + pts[0][0] + " " + pts[0][1];
      for (var k = 1; k < pts.length; k++) {
        var p0 = pts[k - 1], p1 = pts[k], my = (p0[1] + p1[1]) / 2;
        d += " C " + p0[0] + " " + my + " " + p1[0] + " " + my + " " + p1[0] + " " + p1[1];
      }
      ghost.setAttribute("d", d); trail.setAttribute("d", d);
      clipRect.setAttribute("width", W);
      len = trail.getTotalLength();
      update();
    }
    function update() {
      ticking = false;
      if (!len) return;
      var max = H - window.innerHeight;
      var sc = window.pageYOffset || document.documentElement.scrollTop || 0;
      var prog = max > 0 ? Math.min(1, Math.max(0, sc / max)) : 0;
      var dist = prog * len;
      var pt = trail.getPointAtLength(dist);
      var pt2 = trail.getPointAtLength(Math.min(len, dist + 2));
      var ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
      plane.style.transform = "translate(" + pt.x + "px," + pt.y + "px) translate(-50%,-50%) rotate(" + ang + "deg)";
      clipRect.setAttribute("height", Math.max(0, pt.y));
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
