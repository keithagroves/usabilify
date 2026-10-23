// Master control table: search, filter selects, sortable headers (aria-sort), optional row selection,
// whole-row click with a real link in the key column for keyboard users. State persists per table id.
function MasterTable(host, o) {
  // o: { id, columns:[{key,label,value(r),render(r)→html,num,wrap,title}], rows, href(r), key(r)→html link text,
  //      filters:[{key,label,options:[[value,text]],test(r,v)}], search(r)→string, sort:{key,dir}, selectable, actions(selected)→html, onAction(name, selected) }
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const storeKey = `mt:${o.id}`;
  let st = { q: "", f: {}, sort: o.sort ?? { key: o.columns[0].key, dir: "desc" } };
  try { st = { ...st, ...JSON.parse(localStorage.getItem(storeKey) || "{}") }; } catch {}
  const selected = new Set();
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(st)); } catch {} };

  host.innerHTML = `<div class="mt">
    <div class="mt-bar" role="search">
      <input type="search" placeholder="Search…" aria-label="Search ${esc(o.label ?? "rows")}" value="${esc(st.q)}">
      ${(o.filters ?? []).map((f) => `<select data-f="${f.key}" aria-label="${esc(f.label)}"><option value="">${esc(f.label)}: all</option>${f.options.map(([v, t]) => `<option value="${esc(v)}" ${st.f[f.key] === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`).join("")}
      <button type="button" data-reset>Reset</button>
      <span class="grow"></span>
      <span class="mt-actions"></span>
      <span class="mt-count" aria-live="polite"></span>
    </div>
    <div class="mt-scroll"><table><thead><tr>
      ${o.selectable ? `<th scope="col" style="width:32px"><span class="sr">Select</span></th>` : ""}
      ${o.columns.map((c) => `<th scope="col" class="${c.num ? "num" : ""}" data-col="${c.key}" aria-sort="none" ${c.title ? `title="${esc(c.title)}"` : ""}><button type="button">${esc(c.label)}</button></th>`).join("")}
    </tr></thead><tbody></tbody></table></div></div>`;
  const tbody = host.querySelector("tbody"), count = host.querySelector(".mt-count"), actions = host.querySelector(".mt-actions");

  function rows() {
    const q = st.q.trim().toLowerCase();
    let rs = o.rows.filter((r) => (!q || (o.search ? o.search(r) : JSON.stringify(r)).toLowerCase().includes(q)));
    for (const f of o.filters ?? []) if (st.f[f.key]) rs = rs.filter((r) => f.test(r, st.f[f.key]));
    const col = o.columns.find((c) => c.key === st.sort.key) ?? o.columns[0];
    const val = col.value ?? ((r) => r[col.key]);
    const dir = st.sort.dir === "asc" ? 1 : -1;
    return rs.sort((a, b) => { const x = val(a), y = val(b); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }

  function draw() {
    const rs = rows();
    host.querySelectorAll("th[data-col]").forEach((th) => th.setAttribute("aria-sort", th.dataset.col === st.sort.key ? (st.sort.dir === "asc" ? "ascending" : "descending") : "none"));
    tbody.innerHTML = rs.length ? rs.map((r) => {
      const id = o.rowId(r), href = o.href?.(r);
      return `<tr data-id="${esc(id)}" ${href ? `data-href="${esc(href)}"` : ""} class="${selected.has(id) ? "sel" : ""}">
        ${o.selectable ? `<td><input type="checkbox" aria-label="Select ${esc(id)}" ${selected.has(id) ? "checked" : ""}></td>` : ""}
        ${o.columns.map((c, i) => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrap" : ""}">${i === 0 && href ? `<a href="${esc(href)}">${c.render ? c.render(r) : esc(r[c.key])}</a>` : c.render ? c.render(r) : esc(r[c.key] ?? "–")}</td>`).join("")}
      </tr>`;
    }).join("") : `<tr><td class="empty" colspan="${o.columns.length + (o.selectable ? 1 : 0)}">${esc(o.empty ?? "Nothing matches.")}</td></tr>`;
    count.textContent = `${rs.length} of ${o.rows.length} ${o.noun ?? "rows"}${selected.size ? ` · ${selected.size} selected` : ""}`;
    if (o.actions) actions.innerHTML = o.actions([...selected]);
  }

  host.querySelector("input[type=search]").addEventListener("input", (e) => { st.q = e.target.value; save(); draw(); });
  host.querySelectorAll("select[data-f]").forEach((s) => s.addEventListener("change", () => { st.f[s.dataset.f] = s.value; save(); draw(); }));
  host.querySelector("[data-reset]").addEventListener("click", () => { st = { q: "", f: {}, sort: o.sort ?? st.sort }; save(); host.querySelector("input[type=search]").value = ""; host.querySelectorAll("select[data-f]").forEach((s) => (s.value = "")); draw(); });
  host.querySelectorAll("th[data-col] button").forEach((b) => b.addEventListener("click", () => {
    const k = b.parentElement.dataset.col;
    st.sort = st.sort.key === k ? { key: k, dir: st.sort.dir === "asc" ? "desc" : "asc" } : { key: k, dir: o.columns.find((c) => c.key === k).num ? "desc" : "asc" };
    save(); draw();
  }));
  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]"); if (!tr) return;
    if (e.target.matches("input[type=checkbox]")) { const id = tr.dataset.id; e.target.checked ? selected.add(id) : selected.delete(id); tr.classList.toggle("sel", e.target.checked); draw(); return; }
    if (e.target.closest("a,button,input,select")) return;
    if (tr.dataset.href) location.hash = tr.dataset.href.replace(/^#/, "");
  });
  actions.addEventListener("click", (e) => { const b = e.target.closest("[data-action]"); if (b && o.onAction) o.onAction(b.dataset.action, [...selected]); });
  draw();
  return { redraw: draw, selected };
}
