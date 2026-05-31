// ============================================================
// Shared windows editor — used by /crm/project.html (Windows tab)
// and /crm/lead.html (Windows card). Renders room cards with a
// top-down floor-plan SVG and a per-row detail editor.
//
// Convention: start in the back-left corner and work CLOCKWISE.
// Wall sweep order: BACK → RIGHT → FRONT → LEFT. Within a wall:
//   back  → left-to-right
//   right → top-to-bottom
//   front → right-to-left   (continuing the clockwise sweep)
//   left  → bottom-to-top   (continuing the clockwise sweep)
// Window letters (A, B, C…) are assigned in this clockwise order.
// ============================================================

(function () {
  const WALLS = ["back", "right", "front", "left"];
  const WALL_ORDER = { back: 0, right: 1, front: 2, left: 3, "(none)": 99 };

  // Sort windows clockwise from back-left
  function sortClockwise(windows) {
    return [...windows].sort((a, b) => {
      const ao = WALL_ORDER[a.wall || "(none)"] ?? 99;
      const bo = WALL_ORDER[b.wall || "(none)"] ?? 99;
      if (ao !== bo) return ao - bo;
      return (a.position ?? 0) - (b.position ?? 0);
    });
  }

  function letterAt(i) { return String.fromCharCode(65 + (i % 26)); }

  const WE = window.WindowsEditor = {
    catalog: [],
    host: null,

    init(hostEl, initialWindows, options = {}) {
      this.host = hostEl;
      this.catalog = options.catalog || [];
      this.render(initialWindows || []);
    },

    setCatalog(catalog) {
      this.catalog = catalog || [];
      this.host?.querySelectorAll("select.js-prod").forEach((sel) => {
        const cur = sel.value;
        sel.innerHTML = this.prodOptions(cur);
      });
    },

    render(windows) {
      if (!this.host) return;
      const sorted = sortClockwise(windows);
      const byRoom = {};
      const roomOrder = [];
      for (const w of sorted) {
        const key = w.room || "(unassigned)";
        if (!byRoom[key]) { byRoom[key] = []; roomOrder.push(key); }
        byRoom[key].push(w);
      }
      this.host.innerHTML = roomOrder.length
        ? roomOrder.map((r) => this.roomCard(r, byRoom[r])).join("")
        : `<div class="card" style="text-align:center;padding:40px;color:var(--ink-soft);font-size:14px">
             No windows yet — click <strong>+ Room</strong> to start (we'll ask room name + window count),
             or <strong>+ Window</strong> for a single window.
           </div>`;
      // Re-letter + redraw each card so saved data is reflected
      this.host.querySelectorAll(".room-card").forEach((c) => this.refreshCard(c));
    },

    // Walk all room cards and return a windows[] array (clockwise + relettered already)
    collect() {
      if (!this.host) return [];
      const out = [];
      this.host.querySelectorAll(".room-card").forEach((card) => {
        const room = card.querySelector(".room-name").value.trim();
        card.querySelectorAll(".room-window-rows tr").forEach((tr) => {
          const data = this.collectRowData(tr);
          if (!room && !data.label && data.width_in == null && data.height_in == null) return;
          out.push({ ...data, room: room || "(unassigned)" });
        });
      });
      return out;
    },

    // ---- Internal renderers ----
    roomCard(roomName, windows) {
      const e = SSCrm.esc;
      return `<div class="card room-card" data-room="${e(roomName)}">
        <div class="card-head" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <input class="room-name" value="${e(roomName === "(unassigned)" ? "" : roomName)}"
                 placeholder="Room name (Living, Primary BR…)"
                 style="flex:1;min-width:160px;border:0;padding:6px 0;font-size:18px;font-weight:600;background:transparent;color:var(--ink)"/>
          <span class="room-count muted" style="font-size:12px">${windows.length} window${windows.length === 1 ? "" : "s"}</span>
          <button class="btn ghost sm" onclick="WindowsEditor.addWindowToRoom(this)">+ Window here</button>
          <button class="btn ghost sm" onclick="WindowsEditor.removeRoom(this)" style="color:var(--danger)" title="Remove room (and its windows)">Remove</button>
        </div>
        <!-- Floor plan on the left, table on the right (stacks on narrow). Driven by .room-body CSS. -->
        <div class="room-body" style="margin-top:12px">
          <div class="room-floorplan">${this.floorplanSvg(windows)}</div>
          <div class="room-windows">
            <table class="lines" style="width:100%"><thead><tr>
              <th style="width:36px">#</th>
              <th style="min-width:120px">Label</th>
              <th style="width:100px">Wall</th>
              <th class="num" style="width:70px">W″</th>
              <th class="num" style="width:70px">H″</th>
              <th style="width:90px">Mount</th>
              <th style="min-width:220px">Product</th>
              <th style="min-width:120px">Color</th>
              <th style="min-width:150px">Notes</th>
              <th style="width:32px"></th>
            </tr></thead>
            <tbody class="room-window-rows">
              ${windows.map((w, i) => this.winRow(w, i)).join("") || this.winRow({}, 0)}
            </tbody></table>
          </div>
        </div>
      </div>`;
    },

    winRow(w, i) {
      const e = SSCrm.esc;
      const L = letterAt(i);
      return `<tr>
        <td style="text-align:center;font-weight:700;color:var(--accent-ink);background:var(--accent-soft);font-size:13px">${L}</td>
        <td><input data-f="label" value="${e(w.label || "")}" placeholder="North, Bay-left…"/></td>
        <td>
          <select data-f="wall" onchange="WindowsEditor.redrawCardFromInput(this)">
            <option value="">—</option>
            <option value="back"  ${w.wall === "back"  ? "selected" : ""}>Back</option>
            <option value="right" ${w.wall === "right" ? "selected" : ""}>Right</option>
            <option value="front" ${w.wall === "front" ? "selected" : ""}>Front</option>
            <option value="left"  ${w.wall === "left"  ? "selected" : ""}>Left</option>
          </select>
        </td>
        <td><input class="num" data-f="width_in" value="${w.width_in ?? ""}" type="number" step="0.125"/></td>
        <td><input class="num" data-f="height_in" value="${w.height_in ?? ""}" type="number" step="0.125"/></td>
        <td><select data-f="mount"><option value="">—</option><option ${w.mount === "inside" ? "selected" : ""}>inside</option><option ${w.mount === "outside" ? "selected" : ""}>outside</option></select></td>
        <td><select data-f="product_id" class="js-prod">${this.prodOptions(w.product_id)}</select></td>
        <td><input data-f="color" value="${e(w.color || "")}" placeholder="White, walnut…"/></td>
        <td><input data-f="notes" value="${e(w.notes || "")}"/></td>
        <td><button class="rm" onclick="WindowsEditor.removeWinRow(this)" title="Remove">×</button></td>
      </tr>`;
    },

    prodOptions(selectedId) {
      const e = SSCrm.esc;
      if (!this.catalog.length) return `<option value="">— —</option>`;
      return `<option value="">— Product —</option>` + this.catalog.map((p) =>
        `<option value="${p.id}" ${selectedId == p.id ? "selected" : ""}>${e(p.name)}</option>`
      ).join("");
    },

    // Top-down floor plan, viewer at the entry (bottom of the square).
    // Windows are positioned along the clockwise sweep on their wall.
    floorplanSvg(windows) {
      const VB = 320, M = 30;
      const RX = M, RY = M, RW = VB - M*2, RH = VB - M*2;
      const buckets = { back: [], right: [], front: [], left: [], "(none)": [] };
      // Honor sortClockwise order by reusing the input order (caller should pass sorted)
      windows.forEach((w, i) => {
        const wall = WALLS.includes(w.wall) ? w.wall : "(none)";
        buckets[wall].push({ w, idx: i, letter: letterAt(i) });
      });
      const rects = [];
      for (const wall of WALLS) {
        const list = buckets[wall];
        if (!list.length) continue;
        const n = list.length;
        list.forEach((e, j) => {
          // tSweep is the position along the clockwise sweep direction (0 = first window, 1 = last)
          const tSweep = (j + 0.5) / n;
          // Map sweep → visual SVG coordinate (varies per wall)
          let tVisual;
          if (wall === "back" || wall === "right") {
            tVisual = tSweep;          // back: left→right; right: top→bottom
          } else {
            tVisual = 1 - tSweep;      // front: right→left; left: bottom→top
          }
          const WSZ = 38, WT = 9;
          let x, y, ww, wh;
          if (wall === "back")  { x = RX + tVisual * RW - WSZ/2; y = RY - WT/2;             ww = WSZ; wh = WT; }
          if (wall === "front") { x = RX + tVisual * RW - WSZ/2; y = RY + RH - WT/2;        ww = WSZ; wh = WT; }
          if (wall === "left")  { x = RX - WT/2;                  y = RY + tVisual * RH - WSZ/2;  ww = WT;  wh = WSZ; }
          if (wall === "right") { x = RX + RW - WT/2;             y = RY + tVisual * RH - WSZ/2;  ww = WT;  wh = WSZ; }
          const cx = x + ww/2, cy = y + wh/2;
          rects.push(`
            <rect x="${x}" y="${y}" width="${ww}" height="${wh}" rx="2" fill="#3B82F6" stroke="#1E40AF" stroke-width="1" data-idx="${e.idx}" style="cursor:pointer"/>
            <text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="10" font-weight="700" fill="#fff" pointer-events="none">${e.letter}</text>
          `);
        });
      }
      const unassigned = buckets["(none)"].length;
      // Start-here marker at back-left corner
      return `
        <svg viewBox="0 0 ${VB} ${VB}" style="width:100%;height:auto;background:#F8FAFC;border:1px solid var(--line);border-radius:var(--r);display:block">
          <rect x="${RX}" y="${RY}" width="${RW}" height="${RH}" fill="#FFFFFF" stroke="#0F172A" stroke-width="2.5"/>
          <text x="${VB/2}" y="${RY - 10}" text-anchor="middle" font-size="11" fill="#64748B" font-weight="600" letter-spacing="0.05em">BACK</text>
          <text x="${RX - 6}" y="${VB/2}" text-anchor="middle" font-size="11" fill="#64748B" font-weight="600" letter-spacing="0.05em" transform="rotate(-90 ${RX - 6} ${VB/2})">LEFT</text>
          <text x="${RX + RW + 6}" y="${VB/2}" text-anchor="middle" font-size="11" fill="#64748B" font-weight="600" letter-spacing="0.05em" transform="rotate(90 ${RX + RW + 6} ${VB/2})">RIGHT</text>
          <text x="${VB/2}" y="${RY + RH + 16}" text-anchor="middle" font-size="11" fill="#64748B" font-weight="600" letter-spacing="0.05em">FRONT (near entry)</text>
          <!-- Start arrow at back-left corner showing the clockwise sweep direction -->
          <g transform="translate(${RX - 4}, ${RY - 4})">
            <circle r="6" fill="#10B981" stroke="#047857" stroke-width="1.5"/>
            <text x="0" y="3" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">↻</text>
          </g>
          <text x="${RX + 4}" y="${RY - 14}" font-size="9" fill="#047857" font-weight="600">START</text>
          ${rects.join("")}
          <g transform="translate(${VB/2}, ${RY + RH + 4})">
            <path d="M 0 14 L -6 22 L 6 22 Z" fill="#0F172A"/>
            <text x="0" y="32" text-anchor="middle" font-size="10" font-weight="700" fill="#0F172A">ENTRY</text>
          </g>
        </svg>
        ${unassigned ? `<p class="muted" style="font-size:11px;margin:6px 0 0">${unassigned} window${unassigned === 1 ? " has" : "s have"} no wall yet — pick one to place ${unassigned === 1 ? "it" : "them"} on the plan.</p>` : ""}
      `;
    },

    // ---- Mutators ----

    refreshCard(card) {
      if (!card) return;
      const rows = [...card.querySelectorAll(".room-window-rows tr")];
      // Read current values, sort clockwise, re-render rows in clockwise order
      const current = rows.map((tr) => this.collectRowData(tr));
      const sorted = sortClockwise(current);
      // Wipe and re-emit rows in clockwise order with refreshed letters
      const tbody = card.querySelector(".room-window-rows");
      tbody.innerHTML = sorted.map((w, i) => this.winRow(w, i)).join("") || this.winRow({}, 0);
      // Redraw the SVG from the now-sorted rows
      card.querySelector(".room-floorplan").innerHTML = this.floorplanSvg(sorted);
      card.querySelector(".room-count").textContent = `${rows.length} window${rows.length === 1 ? "" : "s"}`;
    },

    collectRowData(tr) {
      const v = (f) => tr.querySelector(`[data-f="${f}"]`)?.value ?? "";
      return {
        label: v("label"),
        wall:  v("wall") || null,
        width_in:  v("width_in") !== ""  ? Number(v("width_in"))  : null,
        height_in: v("height_in") !== "" ? Number(v("height_in")) : null,
        mount: v("mount") || null,
        product_id: v("product_id") ? parseInt(v("product_id"), 10) : null,
        color: v("color") || null,
        notes: v("notes") || null,
      };
    },

    redrawCardFromInput(el) { this.refreshCard(el.closest(".room-card")); },

    removeWinRow(btn) {
      const card = btn.closest(".room-card");
      btn.closest("tr").remove();
      this.refreshCard(card);
    },

    removeRoom(btn) {
      if (!confirm("Remove this room and all its windows?")) return;
      btn.closest(".room-card").remove();
    },

    async addRoom() {
      const name = prompt("Room name?  (Living, Primary BR, Kitchen…)");
      if (!name) return;
      const cntStr = prompt(`How many windows in ${name}?`, "1");
      const count = Math.max(1, Math.min(20, parseInt(cntStr || "1", 10) || 1));
      const host = this.host;
      // Clear empty-state if it's the only thing in the host
      if (host.querySelector(".card") && !host.querySelector(".room-card")) host.innerHTML = "";
      const windows = Array.from({ length: count }, () => ({ room: name }));
      host.insertAdjacentHTML("beforeend", this.roomCard(name, windows));
      const card = host.lastElementChild;
      card.scrollIntoView({ behavior: "smooth", block: "start" });
      this.refreshCard(card);
    },

    addWindow() {
      let card = this.host.querySelector('.room-card[data-room="(unassigned)"]');
      if (!card) {
        if (this.host.querySelector(".card") && !this.host.querySelector(".room-card")) this.host.innerHTML = "";
        this.host.insertAdjacentHTML("beforeend", this.roomCard("(unassigned)", [{}]));
        this.refreshCard(this.host.lastElementChild);
        return;
      }
      card.querySelector(".room-window-rows").insertAdjacentHTML("beforeend",
        this.winRow({}, card.querySelectorAll(".room-window-rows tr").length));
      this.refreshCard(card);
    },

    addWindowToRoom(btn) {
      const card = btn.closest(".room-card");
      card.querySelector(".room-window-rows").insertAdjacentHTML("beforeend",
        this.winRow({}, card.querySelectorAll(".room-window-rows tr").length));
      this.refreshCard(card);
    },

    sortClockwise,  // expose for callers that need it
  };
})();
