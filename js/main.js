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

/* ===== Process section: a paper plane that loops around the four steps ===== */
(function () {
  try {
    var fp = document.querySelector(".flightpath");
    if (!fp) return;
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg"); svg.setAttribute("class", "fpfly"); svg.setAttribute("aria-hidden", "true");
    var line = document.createElementNS(NS, "path"); line.setAttribute("class", "fpfly__line"); svg.appendChild(line);
    fp.insertBefore(svg, fp.firstChild);
    var plane = document.createElement("div"); plane.className = "fpfly__plane"; plane.setAttribute("aria-hidden", "true");
    plane.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    fp.appendChild(plane);

    function build() {
      var dots = fp.querySelectorAll(".fp-node__dot");
      if (!dots.length) return;
      var box = fp.getBoundingClientRect();
      var W = fp.clientWidth, Hh = fp.clientHeight;
      svg.setAttribute("width", W); svg.setAttribute("height", Hh); svg.setAttribute("viewBox", "0 0 " + W + " " + Hh);
      var cs = [];
      dots.forEach(function (d) { var r = d.getBoundingClientRect(); cs.push({ x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, r: r.width / 2 }); });
      var cy = cs[0].y, rad = cs[0].r, LR = rad + 8;
      var f = function (n) { return n.toFixed(1); };
      var x0 = cs[0].x - rad - 46, x1 = cs[cs.length - 1].x + rad + 46;
      // Start at the left, then loop a full circle around each number (connected
      // along the bottom), and finally fly off up to the right. Open path → the
      // plane flies through ONCE.
      var d = "M " + f(x0) + " " + f(cy);
      for (var i = 0; i < cs.length; i++) {
        var x = cs[i].x, by = cy + LR, prevX = i === 0 ? x0 : cs[i - 1].x;
        d += " Q " + f((prevX + x) / 2) + " " + f(by + 22) + " " + f(x) + " " + f(by); // glide to the bottom of this number
        d += " A " + f(LR) + " " + f(LR) + " 0 0 1 " + f(x) + " " + f(cy - LR);        // up & around the left/top
        d += " A " + f(LR) + " " + f(LR) + " 0 0 1 " + f(x) + " " + f(by);             // around the right/bottom — full circle
      }
      d += " Q " + f(x1) + " " + f(cy + LR) + " " + f(x1) + " " + f(cy - rad);          // fly off up to the right
      line.setAttribute("d", d);
      plane.style.setProperty("offset-path", 'path("' + d + '")');
      plane.style.setProperty("-webkit-offset-path", 'path("' + d + '")');
    }

    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(build, 200); });
    window.addEventListener("load", function () { setTimeout(build, 120); });
    build();

    // Fly through ONCE, the first time the section scrolls into view.
    if ("IntersectionObserver" in window) {
      var io2 = new IntersectionObserver(function (en) {
        en.forEach(function (e) { if (e.isIntersecting) { fp.classList.add("is-flying"); io2.unobserve(fp); } });
      }, { rootMargin: "0px 0px -12% 0px" });
      io2.observe(fp);
    } else { fp.classList.add("is-flying"); }
  } catch (e) { /* never break the page over a flourish */ }
})();
