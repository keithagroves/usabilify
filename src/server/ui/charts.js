// Small SVG charts for the dashboard. Rules (dataviz skill): thin marks, 4px rounded data-ends square at the
// baseline, 2px surface gaps, hairline solid grid, one axis, legend for 2+ series, tooltips on hover AND focus
// that only enhance (a data table under each chart holds every value). Labels go in via textContent.
const Charts = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const tip = document.getElementById("tip");

  // One tooltip for every chart: value leads, label follows.
  function showTip(el, x, y) {
    tip.replaceChildren();
    const b = document.createElement("b"); b.textContent = el.dataset.tv ?? "";
    const s = document.createElement("span"); s.textContent = el.dataset.tl ?? "";
    tip.append(b, s);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - r.width - 8, x + 14)}px`;
    tip.style.top = `${Math.max(8, y - r.height - 10)}px`;
  }
  document.addEventListener("pointermove", (e) => { const el = e.target.closest?.("[data-tv]"); if (el) showTip(el, e.clientX, e.clientY); else tip.hidden = true; });
  document.addEventListener("focusin", (e) => { const el = e.target.closest?.("[data-tv]"); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.right, r.top); } });
  document.addEventListener("focusout", () => (tip.hidden = true));

  /** Path for a bar with 4px rounded data-end and square baseline. dir: "up" | "right". */
  function barPath(x, y, w, h, dir, r = 4) {
    if (dir === "up") { r = Math.min(r, w / 2, h); return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`; }
    r = Math.min(r, h / 2, w); return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  const tipAttrs = (value, label) => `tabindex="0" data-tv="${esc(value)}" data-tl="${esc(label)}"`;

  function table(headers, rows) {
    return `<details class="data"><summary>Data table</summary><table class="plain"><thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  }

  function wilson(k, n, z = 1.96) {
    if (!n) return [0, 1];
    const p = k / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
  }

  /** Re-render on resize so text stays at its real size (no viewBox scaling). */
  function mount(el, draw) {
    const go = () => { const w = el.clientWidth; if (w > 0) el.innerHTML = draw(w); };
    go();
    const ro = new ResizeObserver(() => go());
    ro.observe(el);
    return () => ro.disconnect();
  }

  /** Columns: one value per category on a 0–1 scale, with 95% interval whiskers. Single series → no legend. */
  function columns(el, items, { label, height = 200 } = {}) {
    // items: [{ x: "label", k, n, href }]
    return mount(el, (W) => {
      const m = { t: 14, r: 8, b: 38, l: 38 }, H = height, iw = W - m.l - m.r, ih = H - m.t - m.b;
      const band = iw / Math.max(1, items.length), bw = Math.min(24, band * 0.6);
      const y = (v) => m.t + ih * (1 - v);
      let s = `<svg class="chart" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
      for (const g of [0, 0.5, 1]) s += `<line class="${g ? "grid" : "axis"}" x1="${m.l}" x2="${W - m.r}" y1="${y(g)}" y2="${y(g)}"/><text x="${m.l - 6}" y="${y(g) + 4}" text-anchor="end">${g * 100}%</text>`;
      items.forEach((d, i) => {
        const v = d.n ? d.k / d.n : 0, cx = m.l + band * i + band / 2, h = Math.max(0, ih * v);
        const [lo, hi] = wilson(d.k, d.n);
        const tv = `${Math.round(v * 100)}% completed`, tl = `${d.x} · ${d.k}/${d.n} sessions · 95% interval ${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
        const shape = h > 0.5 ? `<path d="${barPath(cx - bw / 2, y(v), bw, h, "up")}" fill="var(--accent)"/>` : "";
        const hit = `<rect x="${cx - band / 2}" y="${m.t}" width="${band}" height="${ih}" fill="transparent" ${tipAttrs(tv, tl)}/>`;
        s += `<g>${d.href ? `<a href="${esc(d.href)}">` : ""}${shape}<line class="whisk" x1="${cx}" x2="${cx}" y1="${y(hi)}" y2="${y(lo)}"/>${hit}${d.href ? "</a>" : ""}</g>`;
        if (items.length <= 12 || i % Math.ceil(items.length / 12) === 0) s += `<text x="${cx}" y="${H - m.b + 16}" text-anchor="middle">${esc(d.x)}</text><text x="${cx}" y="${H - m.b + 30}" text-anchor="middle">n=${d.n}</text>`;
      });
      const last = items[items.length - 1];
      if (last?.n) s += `<text class="val" x="${m.l + band * (items.length - 1) + band / 2}" y="${y(last.k / last.n) - 6}" text-anchor="middle">${Math.round((last.k / last.n) * 100)}%</text>`;
      return s + "</svg>";
    });
  }

  /** Horizontal 100% stacked bars, one per row. series: [{ key, label, color, icon }]. */
  function stacked(el, rows, series, { label } = {}) {
    // rows: [{ label, values: { key: n }, href }]
    return mount(el, (W) => {
      const lw = 90, rh = 30, bh = 18, H = rows.length * rh + 4, iw = W - lw - 40;
      let s = `<svg class="chart" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
      rows.forEach((r, i) => {
        const total = series.reduce((a, se) => a + (r.values[se.key] ?? 0), 0) || 1;
        const y = i * rh + (rh - bh) / 2;
        s += `<text class="lbl" x="0" y="${y + bh / 2 + 4}">${esc(r.label)}</text>`;
        let x = lw;
        const segs = series.filter((se) => r.values[se.key]);
        segs.forEach((se, j) => {
          const w = (r.values[se.key] / total) * iw - (j < segs.length - 1 ? 2 : 0); // 2px surface gap between segments
          const first = j === 0, lastSeg = j === segs.length - 1;
          const d = lastSeg ? barPath(x, y, Math.max(1, w), bh, "right") : `M${x},${y}h${Math.max(1, w)}v${bh}h${-Math.max(1, w)}Z`;
          s += `<path d="${d}" fill="${se.color}" ${tipAttrs(`${r.values[se.key]} of ${total}`, `${r.label} · ${se.icon} ${se.label}`)}/>`;
          x += w + 2;
          void first;
        });
        s += `<text x="${W - 4}" y="${y + bh / 2 + 4}" text-anchor="end">${r.values[series[0].key] ?? 0}/${total}</text>`;
      });
      return s + "</svg>";
    });
  }

  /** Ranked horizontal bars, single series, value at the end of each bar. */
  function ranked(el, items, { label } = {}) {
    // items: [{ label, n, sub }]
    return mount(el, (W) => {
      const lw = Math.min(170, W * 0.42), rh = 28, bh = 14, H = items.length * rh + 2, iw = W - lw - 36;
      const max = Math.max(1, ...items.map((d) => d.n));
      let s = `<svg class="chart" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
      items.forEach((d, i) => {
        const y = i * rh + (rh - bh) / 2, w = Math.max(2, (d.n / max) * iw);
        s += `<text class="lbl" x="0" y="${y + bh / 2 + 4}">${esc(d.label)}</text>`;
        s += `<path d="${barPath(lw, y, w, bh, "right")}" fill="var(--accent)" ${tipAttrs(`${d.n}`, `${d.label}${d.sub ? " · " + d.sub : ""}`)}/>`;
        s += `<text class="val" x="${lw + w + 6}" y="${y + bh / 2 + 4}">${d.n}</text>`;
      });
      return s + "</svg>";
    });
  }

  /** Heatmap of failure rate (sequential blue, light → dark), with the outcome written in every cell. */
  function heat(el, rows, cols, cell, { label } = {}) {
    // cell(r, c) → { rate, text, sym, href, tv, tl } | null
    const steps = ["var(--seq-100)", "var(--seq-200)", "var(--seq-300)", "var(--seq-400)", "var(--seq-500)", "var(--seq-600)"];
    return mount(el, (W) => {
      const lw = 90, th = 22, rh = 34, H = th + rows.length * rh, cw = (W - lw) / Math.max(1, cols.length);
      let s = `<svg class="chart" width="${W}" height="${H}" role="img" aria-label="${esc(label)}">`;
      cols.forEach((c, j) => (s += `<text x="${lw + cw * j + cw / 2}" y="14" text-anchor="middle">${esc(c.label)}</text>`));
      rows.forEach((r, i) => {
        const y = th + i * rh;
        s += `<text class="lbl" x="0" y="${y + rh / 2 + 4}">${esc(r.label)}</text>`;
        cols.forEach((c, j) => {
          const d = cell(r, c), x = lw + cw * j;
          if (!d) { s += `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="4" fill="var(--panel-2)"/>`; return; }
          const idx = Math.min(steps.length - 1, Math.round(d.rate * (steps.length - 1)));
          const dark = idx >= 3;
          const rect = `<rect x="${x + 1}" y="${y + 1}" width="${cw - 2}" height="${rh - 2}" rx="4" fill="${steps[idx]}" ${tipAttrs(d.tv, d.tl)}/>`;
          const txt = `<text x="${x + cw / 2}" y="${y + rh / 2 + 4}" text-anchor="middle" style="fill:${dark ? "#fff" : "#0d366b"};font-weight:600;pointer-events:none">${esc(d.sym)} ${esc(d.text)}</text>`;
          s += d.href ? `<a href="${esc(d.href)}">${rect}${txt}</a>` : rect + txt;
        });
      });
      return s + "</svg>";
    });
  }

  return { columns, stacked, ranked, heat, table, wilson, esc };
})();
