// Dependency-free 3D knowledge-graph renderer (canvas 2D with perspective projection).
// Layouts: "chakra" (tilted concentric rings), "sphere" (Fibonacci shells), "spiral" (helix).

const TAU = Math.PI * 2;

export const LAYOUTS = [
  { id: "chakra", label: "Chakra · rings" },
  { id: "sphere", label: "Sphere" },
  { id: "spiral", label: "Spiral" },
];

const TYPE_RADIUS = { text: 15, chapter: 11, concept: 7, passage: 3.4 };

export class Graph3D {
  constructor(canvas, { onSelect, onAnnounce } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.onSelect = onSelect || (() => {});
    this.onAnnounce = onAnnounce || (() => {});
    this.nodes = [];
    this.edges = [];
    this.layout = "sphere";
    this.chapterFilter = "all";
    this.showPassages = true;
    this.rotY = 0.4;
    this.rotX = -0.42;
    this.zoom = 1.35;
    this.autoRotate = true;
    this.hovered = null;
    this.selected = null;
    this.focusIndex = -1;
    this._drag = null;
    this._animated = true;
    this._themeColors = this._readTheme();
    this._bind();
    this._resizeObserver = new ResizeObserver(() => this._resize());
    this._resizeObserver.observe(canvas.parentElement);
    this._resize();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
  }

  _readTheme() {
    const cs = getComputedStyle(document.documentElement);
    return {
      text: cs.getPropertyValue("--g-text").trim() || "#a64e2e",
      chapter: [
        cs.getPropertyValue("--g-c1").trim() || "#b3562e",
        cs.getPropertyValue("--g-c2").trim() || "#2e7d6b",
        cs.getPropertyValue("--g-c3").trim() || "#41618f",
        cs.getPropertyValue("--g-c4").trim() || "#7c5aa0",
      ],
      concept: cs.getPropertyValue("--g-concept").trim() || "#355a4b",
      passage: cs.getPropertyValue("--g-passage").trim() || "#617c8e",
      edge: cs.getPropertyValue("--g-edge").trim() || "rgba(120,110,90,0.35)",
      label: cs.getPropertyValue("--g-label").trim() || "#25342e",
    };
  }

  refreshTheme() {
    this._themeColors = this._readTheme();
  }

  setData(nodes, edges) {
    this.nodes = nodes;
    this.edges = edges;
    this._positionsDirty = true;
  }
  setLayout(layout) { this.layout = layout; this._positionsDirty = true; }
  setChapterFilter(f) { this.chapterFilter = f; this._positionsDirty = true; }
  setShowPassages(v) { this.showPassages = v; this._positionsDirty = true; }
  setAutoRotate(v) { this.autoRotate = v; }
  setSelected(id) { this.selected = id; }

  _visibleNodes() {
    return this.nodes.filter((n) =>
      (this.chapterFilter === "all" || n.chapter === this.chapterFilter || n.type === "text") &&
      (this.showPassages || n.type !== "passage"));
  }

  _computePositions() {
    const visible = this._visibleNodes();
    const pos = new Map();
    const chapters = visible.filter((n) => n.type === "chapter");
    const concepts = visible.filter((n) => n.type === "concept");
    const passages = visible.filter((n) => n.type === "passage");
    const chIndex = new Map(chapters.map((c, i) => [c.chapter, i]));
    const chapterAngles = new Map(chapters.map((c, i) => [c.chapter, (i / chapters.length) * TAU - Math.PI / 2]));

    if (this.layout === "chakra") {
      for (const n of visible) if (n.type === "text") pos.set(n.id, [0, 0, 0]);
      chapters.forEach((n) => {
        const a = chapterAngles.get(n.chapter);
        pos.set(n.id, [0.30 * Math.cos(a), 0.10 * Math.sin(a * 2) * 0.3, 0.30 * Math.sin(a)]);
      });
      const perCh = new Map();
      concepts.forEach((n) => {
        const ch = n.chapter ?? 1;
        const i = perCh.get(ch) ?? 0;
        perCh.set(ch, i + 1);
        const total = concepts.filter((c) => (c.chapter ?? 1) === ch).length || 1;
        const a = chapterAngles.get(ch) + ((i / total) - 0.5) * (TAU / chapters.length) * 0.92;
        pos.set(n.id, [0.62 * Math.cos(a), 0.05 * Math.sin(i * 2.3), 0.62 * Math.sin(a)]);
      });
      const pPerCh = new Map();
      passages.forEach((n) => {
        const i = pPerCh.get(n.chapter) ?? 0;
        pPerCh.set(n.chapter, i + 1);
        const total = passages.filter((p) => p.chapter === n.chapter).length || 1;
        const base = chapterAngles.get(n.chapter);
        const a = base + ((i / total) - 0.5) * (TAU / chapters.length) * 0.96;
        pos.set(n.id, [0.94 * Math.cos(a), 0.03 * Math.sin(i), 0.94 * Math.sin(a)]);
      });
    } else if (this.layout === "sphere") {
      for (const n of visible) if (n.type === "text") pos.set(n.id, [0, 0, 0]);
      const place = (list, radius, goldenOffset) => {
        list.forEach((n, i) => {
          const sectorBase = n.type === "text" ? 0 : (chapterAngles.get(n.chapter ?? n.chapter) ?? 0);
          const t = (i + 0.5) / list.length;
          const inclination = Math.acos(1 - 2 * t);
          const azimuth = goldenOffset * i + sectorBase * 0.9;
          const sectorPull = n.type === "text" ? 0 : 0.55;
          const a = azimuth * (1 - sectorPull) + sectorBase * sectorPull;
          pos.set(n.id, [
            radius * Math.sin(inclination) * Math.cos(a),
            radius * Math.cos(inclination) * 0.85,
            radius * Math.sin(inclination) * Math.sin(a),
          ]);
        });
      };
      place(chapters, 0.34, 2.39996);
      place(concepts, 0.64, 2.39996);
      place(passages, 0.95, 3.88322);
    } else { // spiral
      for (const n of visible) if (n.type === "text") pos.set(n.id, [0, -1.02, 0]);
      const ordered = [...passages].sort((a, b) => (a.chapter - b.chapter) || (a.verse - b.verse));
      ordered.forEach((n, i) => {
        const t = ordered.length > 1 ? i / (ordered.length - 1) : 0;
        const a = t * TAU * 4.2;
        pos.set(n.id, [0.85 * Math.cos(a), 0.95 - t * 1.9, 0.85 * Math.sin(a)]);
      });
      chapters.forEach((n, i) => {
        const a = (i / chapters.length) * TAU * 4.2 + TAU * 0.2;
        pos.set(n.id, [0.45 * Math.cos(a), 0.85 - i * 0.55, 0.45 * Math.sin(a)]);
      });
      concepts.forEach((n, i) => {
        const t = concepts.length > 1 ? i / (concepts.length - 1) : 0;
        const a = t * TAU * 4.2 + 0.6;
        pos.set(n.id, [0.62 * Math.cos(a), 0.9 - t * 1.8, 0.62 * Math.sin(a)]);
      });
    }
    this._positions = pos;
    this._positionsDirty = false;
  }

  _project([x, y, z]) {
    const cy = Math.cos(this.rotY), sy = Math.sin(this.rotY);
    const cx = Math.cos(this.rotX), sx = Math.sin(this.rotX);
    const x1 = x * cy + z * sy;
    const z1 = -x * sy + z * cy;
    const y1 = y * cx - z1 * sx;
    const z2 = y * sx + z1 * cx;
    const dist = 3.1;
    const scale = (dist / (dist + z2)) * this.zoom;
    return {
      x: this.canvas.width / (2 * this._dpr) + x1 * scale * this._radius,
      y: this.canvas.height / (2 * this._dpr) + y1 * scale * this._radius,
      z: z2, scale,
    };
  }

  _resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this._dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this._radius = Math.min(w, h) * 0.42;
  }

  _frame() {
    if (this._positionsDirty) this._computePositions();
    if (this.autoRotate && !this._drag) this.rotY += 0.0022;
    this._draw();
    requestAnimationFrame(this._frame);
  }

  _draw() {
    const { ctx, canvas } = this;
    const w = canvas.width / this._dpr, h = canvas.height / this._dpr;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!this._positions) return;
    const visible = this._visibleNodes();
    const proj = new Map();
    for (const n of visible) {
      const p = this._positions.get(n.id);
      if (p) proj.set(n.id, this._project(p));
    }
    const colors = this._themeColors;

    // edges
    for (const e of this.edges) {
      const a = proj.get(e.source), b = proj.get(e.target);
      if (!a || !b) continue;
      const depth = (a.scale + b.scale) / 2;
      const selected = this.selected && (e.source === this.selected || e.target === this.selected);
      ctx.strokeStyle = colors.edge;
      ctx.globalAlpha = Math.max(0.05, Math.min(0.5, (depth - 0.55) * (selected ? 2.2 : 1)));
      if (e.relationship === "relatedTo") ctx.setLineDash([3, 5]);
      ctx.lineWidth = selected ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;

    // nodes, far to near
    const sorted = [...visible].sort((na, nb) => (proj.get(nb.id)?.z ?? 0) - (proj.get(na.id)?.z ?? 0));
    this._hitRegions = [];
    for (const n of sorted) {
      const p = proj.get(n.id);
      if (!p) continue;
      const base = TYPE_RADIUS[n.type] ?? 6;
      const r = base * p.scale * (this.hovered === n.id || this.selected === n.id ? 1.35 : 1);
      const color = n.type === "text" ? colors.text
        : n.type === "chapter" ? colors.chapter[(n.chapter - 1) % 4]
        : n.type === "concept" ? colors.concept : colors.passage;
      const alpha = Math.max(0.25, Math.min(1, (p.scale - 0.5) * 1.8));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
      if (this.selected === n.id) {
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colors.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, TAU);
        ctx.stroke();
      }
      const showLabel =
        n.type === "text" || n.type === "chapter" ||
        (n.type === "concept" && (p.scale > 0.82 || this.hovered === n.id || this.selected === n.id)) ||
        (n.type === "passage" && (this.hovered === n.id || this.selected === n.id));
      if (showLabel) {
        ctx.globalAlpha = Math.max(0.55, alpha);
        ctx.fillStyle = colors.label;
        ctx.font = `${n.type === "passage" ? 10 : n.type === "concept" ? 11.5 : 13}px Inter, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText(n.label, p.x, p.y - r - 5);
      }
      this._hitRegions.push({ id: n.id, x: p.x, y: p.y, r: Math.max(r, 8) });
    }
    ctx.globalAlpha = 1;
  }

  _pick(x, y) {
    if (!this._hitRegions) return null;
    let best = null, bestD = Infinity;
    for (const h of this._hitRegions) {
      const d = (h.x - x) ** 2 + (h.y - y) ** 2;
      if (d < h.r * h.r * 2.2 && d < bestD) { best = h; bestD = d; }
    }
    return best;
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      this._drag = { x: e.clientX, y: e.clientY, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener("pointermove", (e) => {
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (this._drag) {
        const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this._drag.moved = true;
        this.rotY += dx * 0.006;
        this.rotX = Math.max(-1.4, Math.min(1.4, this.rotX + dy * 0.005));
        this._drag.x = e.clientX; this._drag.y = e.clientY;
      } else {
        const hit = this._pick(x, y);
        const id = hit?.id ?? null;
        if (id !== this.hovered) {
          this.hovered = id;
          c.style.cursor = id ? "pointer" : "grab";
          if (id) {
            const n = this.nodes.find((n) => n.id === id);
            this.onAnnounce(`${n.type}: ${n.label}${n.sublabel ? " — " + n.sublabel : ""}`);
          }
        }
      }
    });
    c.addEventListener("pointerup", (e) => {
      const wasDrag = this._drag?.moved;
      this._drag = null;
      if (!wasDrag) {
        const rect = c.getBoundingClientRect();
        const hit = this._pick(e.clientX - rect.left, e.clientY - rect.top);
        if (hit) {
          this.selected = hit.id;
          this.onSelect(hit.id);
        }
      }
    });
    c.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.55, Math.min(2.4, this.zoom * (e.deltaY > 0 ? 0.92 : 1.09)));
    }, { passive: false });
    c.addEventListener("keydown", (e) => {
      const step = 0.12;
      if (e.key === "ArrowLeft") { this.rotY -= step; e.preventDefault(); }
      else if (e.key === "ArrowRight") { this.rotY += step; e.preventDefault(); }
      else if (e.key === "ArrowUp") { this.rotX = Math.max(-1.4, this.rotX - step); e.preventDefault(); }
      else if (e.key === "ArrowDown") { this.rotX = Math.min(1.4, this.rotX + step); e.preventDefault(); }
      else if (e.key === "+" || e.key === "=") { this.zoom = Math.min(2.4, this.zoom * 1.1); e.preventDefault(); }
      else if (e.key === "-") { this.zoom = Math.max(0.55, this.zoom * 0.9); e.preventDefault(); }
      else if (e.key === "Enter" || e.key === " ") {
        const visible = this._visibleNodes();
        this.focusIndex = (this.focusIndex + 1) % visible.length;
        const n = visible[this.focusIndex];
        this.selected = n.id;
        this.onAnnounce(`${n.type}: ${n.label}. Press Enter again for next, or O to open.`);
        e.preventDefault();
      } else if ((e.key === "o" || e.key === "O") && this.selected) {
        this.onSelect(this.selected);
        e.preventDefault();
      }
    });
  }
}
