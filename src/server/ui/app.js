// Usabilify dashboard. Plain JS, hash routes: #/  #/run/<study>/<run>  #/session/<id>?step=&lens=  #/personas  #/calibration
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const api = async (p, o) => { const r = await fetch(p, o); if (!r.ok) throw new Error(`${p}: ${r.status} ${await r.text()}`); return r.json(); };
const pct = (x) => `${Math.round(x * 100)}%`;
const OUT = {
  completed: { sym: "✓", word: "Completed", cls: "ok" },
  "gave-up": { sym: "✕", word: "Gave up", cls: "bad" },
  "wrong-done": { sym: "!", word: "Thought done, wasn't", cls: "bad" },
  "timed-out": { sym: "⧗", word: "Ran out of steps", cls: "bad" },
  error: { sym: "⚠", word: "Session error", cls: "warn" },
};
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
let cleanup = () => {};

const side = document.getElementById("side"), menuBtn = document.getElementById("menu");
menuBtn.onclick = () => { const open = !side.classList.contains("open"); side.classList.toggle("open", open); menuBtn.setAttribute("aria-expanded", String(open)); };
side.addEventListener("click", (e) => { if (e.target.closest("a")) { side.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); } });
const studySel = document.getElementById("study");
let STUDY = (() => { try { return localStorage.getItem("study") || ""; } catch { return ""; } })();
async function loadStudies() {
  const ss = await api("/api/studies");
  if (!ss.some((s) => s.id === STUDY)) STUDY = ss[0]?.id ?? "";
  studySel.innerHTML = ss.map((s) => `<option value="${esc(s.id)}" ${s.id === STUDY ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  const cur = ss.find((s) => s.id === STUDY);
  document.getElementById("side-meta").textContent = cur ? `${cur.runs.length} runs` : "";
}
studySel.onchange = () => { STUDY = studySel.value; try { localStorage.setItem("study", STUDY); } catch {} if (!location.hash || location.hash === "#/") route(); };

function setNav(section) {
  document.querySelectorAll(".side nav a").forEach((a) => a.dataset.nav === section ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
}
function crumbs(items) {
  document.getElementById("crumbs").innerHTML = items.map((c, i) => i === items.length - 1 ? `<span aria-current="page">${esc(c[0])}</span>` : `<a href="${c[1]}">${esc(c[0])}</a><span aria-hidden="true">/</span>`).join("");
  document.title = `${items[items.length - 1][0]} · Usabilify`;
}

async function route() {
  cleanup(); cleanup = () => {};
  const [path, query] = (location.hash.slice(1) || "/").split("?");
  const q = new URLSearchParams(query ?? "");
  const parts = path.split("/").filter(Boolean);
  const section = { run: "runs", session: "sessions", persona: "personas" }[parts[0]] ?? parts[0] ?? "overview";
  setNav(section);
  app.className = ["run", "session", "calibration"].includes(parts[0]) ? "legacy" : "";
  app.innerHTML = `<p class="meta">Loading…</p>`;
  try {
    if (!studySel.options.length) await loadStudies();
    if (!parts.length) await overviewPage();
    else if (parts[0] === "runs") await runsPage();
    else if (parts[0] === "sessions") await sessionsPage(q);
    else if (parts[0] === "issues") await issuesPage();
    else if (parts[0] === "monitor") await monitorPage();
    else if (parts[0] === "run") { crumbs([["Runs", "#/runs"], [parts[2], ""]]); await runPage(parts[1], parts[2], q.get("baseline")); }
    else if (parts[0] === "session") await sessionPage(parts[1], q);
    else if (parts[0] === "personas" && parts[1] === "new") await personaForm(null, q.get("from"));
    else if (parts[0] === "personas") await personasPage();
    else if (parts[0] === "persona" && parts[2] === "edit") await personaForm(parts[1]);
    else if (parts[0] === "persona") await personaPage(parts[1]);
    else if (parts[0] === "calibration") { crumbs([["Calibration", ""]]); await calibrationPage(q); }
    else app.innerHTML = "<p>Not found.</p>";
  } catch (e) { app.innerHTML = `<p class="note">${esc(e.message)}</p>`; console.error(e); }
  app.focus({ preventScroll: true });
}
window.addEventListener("hashchange", route);

// ---------- Runs ----------
const unq = (q) => String(q ?? "").trim().replace(/^[“”"']+|[“”"']+$/g, "");
const fmtUsd = (x) => x >= 100 ? `$${Math.round(x)}` : `$${x.toFixed(2)}`;
const fmtDur = (ms) => ms >= 3600e3 ? `${(ms / 3600e3).toFixed(1)}h` : ms >= 60e3 ? `${Math.round(ms / 60e3)}m` : `${Math.round(ms / 1000)}s`;
const shortTs = (ts) => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const OUTCOME_SERIES = [
  { key: "completed", label: "Completed", color: "var(--good)", icon: "✓" },
  { key: "unaware", label: "Completed, didn't know", color: "var(--warning)", icon: "?" },
  { key: "wrongDone", label: "Thought done, wasn't", color: "var(--serious)", icon: "!" },
  { key: "gaveUp", label: "Gave up", color: "var(--critical)", icon: "✕" },
  { key: "other", label: "Timed out or error", color: "var(--neutral)", icon: "⧗" },
];
function delta(cur, prev, { upIsGood = true, pctPoints = false, fmt = (x) => x } = {}) {
  if (prev == null || cur == null) return "";
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return `<span class="delta flat">no change vs previous run</span>`;
  const cls = d > 0 ? (upIsGood ? "up-good" : "up-bad") : upIsGood ? "down-bad" : "down-good";
  return `<span class="delta ${cls}">${d > 0 ? "▲ +" : "▼ −"}${fmt(Math.abs(d))}${pctPoints ? " pts" : ""} <span class="meta" style="font-weight:400">vs previous run</span></span>`;
}

// ---------- Overview ----------
async function overviewPage() {
  await loadStudies();
  if (!STUDY) { crumbs([["Overview", ""]]); app.innerHTML = `<p>No studies yet. Create one under <code>studies/</code> and run it.</p>`; return; }
  const d = await api(`/api/overview?study=${encodeURIComponent(STUDY)}`);
  crumbs([["Overview", ""]]);
  const L = d.latest, P = d.prev;
  if (!L) { app.innerHTML = `<h1>${esc(d.study.name)}</h1><p>No runs yet. <code>usabilify run ${esc(STUDY)}</code></p>`; return; }
  const rate = (r) => (r && r.sessions ? r.completed / r.sessions : null);
  const firing = d.signals.filter((s) => s.firing);
  const hi = (d.topIssues ?? []).filter((i) => i.severity === "high").length;
  const pn = (id) => d.personas[id]?.name ?? id;
  app.innerHTML = `
    <div class="pagehead">
      <div><h1>${esc(d.study.name)}</h1><p class="meta">Latest run <a href="#/run/${esc(STUDY)}/${esc(L.id)}">${esc(L.id)}</a> · ${shortTs(L.ts)} · app <code>${esc(L.app)}</code> · ${d.totals.personas} personas × ${d.totals.tasks} tasks</p></div>
      <div class="row"><a class="btn" href="#/runs">All runs</a><a class="btn primary" href="#/run/${esc(STUDY)}/${esc(L.id)}">Open latest run</a></div>
    </div>
    <section class="tiles" aria-label="Key metrics">
      <div class="tile hero"><div class="label">Task success, latest run</div><div class="value">${Math.round(rate(L) * 100)}%</div>
        <div class="sub">${L.completed} of ${L.sessions} sessions ${delta(rate(L) * 100, P ? rate(P) * 100 : null, { pctPoints: true, fmt: (x) => Math.round(x) })}</div>
        <div class="meter" aria-hidden="true"><div style="width:${rate(L) * 100}%"></div></div></div>
      <div class="tile"><div class="label">Gave up</div><div class="value">${L.gaveUp}</div><div class="sub">${delta(L.gaveUp, P?.gaveUp, { upIsGood: false })}</div></div>
      <div class="tile"><div class="label">Finished without knowing it</div><div class="value">${L.unaware}</div><div class="sub">${L.wrongDone} thought done but weren't</div></div>
      <div class="tile"><div class="label">Issues found</div><div class="value">${L.issues ?? "–"}</div><div class="sub">${L.analyzed ? `${L.highIssues} high severity` : "not analyzed yet"}</div></div>
      <div class="tile"><div class="label">Planted issues recovered</div><div class="value">${d.recall ? `${d.recall.found}/${d.recall.total}` : "–"}</div><div class="sub">${d.recall?.missed?.length ? `missed ${esc(d.recall.missed.join(", "))}` : d.recall ? "none missed" : "no known issues"}</div></div>
    </section>
    <div class="dash" style="margin-top:16px">
      <section class="card span-8"><div class="card-h"><h2>Task success by run</h2><span class="meta">bars: share completed · lines: 95% interval</span></div><div id="c-runs"></div>
        ${Charts.table(["Run", "Started", "Completed", "Sessions"], d.runs.map((r) => [r.id, shortTs(r.ts), r.completed, r.sessions]))}</section>
      <section class="card span-4"><div class="card-h"><h2>Signals</h2><a class="meta" href="#/monitor">Monitor</a></div>
        ${firing.length ? `<ul class="mini-list">${firing.map((s) => `<li><a href="#/monitor"><span class="badge ${s.severity === "high" ? "critical" : "warning"}">${s.severity === "high" ? "✕" : "!"} ${esc(s.severity)}</span><span><span class="t">${esc(s.id.replace(/_/g, " "))}</span><br><span class="meta">${esc(s.scope)}: ${s.value} &gt; ${s.threshold} · ${esc(s.why)}</span></span><span></span></a></li>`).join("")}</ul>` : `<p><span class="badge good">✓ all clear</span></p><p class="meta">${d.signals.length} signals within threshold over the last runs.</p>`}
        <div class="stack" style="margin-top:14px">
          <div class="row"><span class="stat"><span class="k">Runs</span><br><span class="big">${d.totals.runs}</span></span><span class="stat"><span class="k">Sessions</span><br><span class="big">${d.totals.sessions}</span></span><span class="stat"><span class="k">Spend</span><br><span class="big">${fmtUsd(d.totals.costUsd)}</span></span></div>
          <p class="meta">Latest run took ${fmtDur(L.wallMs)} wall time; median session ${L.medianStepsVsBaseline ?? "–"}× the expert's steps.</p>
        </div></section>
      <section class="card span-6"><div class="card-h"><h2>Outcomes by persona</h2><span class="meta">latest run</span></div>
        <ul class="legend">${OUTCOME_SERIES.map((s) => `<li><i style="background:${s.color}"></i>${s.icon} ${esc(s.label)}</li>`).join("")}</ul>
        <div id="c-outcomes"></div>
        ${Charts.table(["Persona", ...OUTCOME_SERIES.map((s) => s.label)], d.byPersona.map((r) => [r.name, ...OUTCOME_SERIES.map((s) => r[s.key])]))}</section>
      <section class="card span-6"><div class="card-h"><h2>Where they fail</h2><span class="meta">failure rate, persona × task · click a cell to watch</span></div><div id="c-heat"></div>
        ${Charts.table(["Persona", "Task", "Failed", "Sessions"], d.grid.map((c) => [pn(c.persona), c.task, c.n - c.completed, c.n]))}</section>
      <section class="card span-7"><div class="card-h"><h2>Top issues</h2><a class="meta" href="#/issues">All issues</a></div>
        ${d.topIssues.length ? `<ul class="mini-list">${d.topIssues.map((i) => { const f = i.findings.find((x) => x.evidence) ?? i.findings[0]; return `<li><a href="#/session/${esc(f?.session)}?step=${f?.atStep ?? 0}"><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span><span><span class="t">${esc(i.title)}</span>${i.known ? ` <span class="chip">planted ${esc(i.known)}</span>` : ""}<br>${f?.evidence ? `<span class="q">“${esc(unq(f.evidence))}” — ${esc(pn(f.persona))}</span>` : ""}</span><span class="meta">${i.personas.length} personas</span></a></li>`; }).join("")}</ul>` : `<p class="meta">Not analyzed. <code>usabilify analyze ${esc(STUDY)} ${esc(L.id)}</code></p>`}</section>
      <section class="card span-5"><div class="card-h"><h2>Issues by kind</h2><span class="meta">sessions affected</span></div><div id="c-kinds"></div>
        ${Charts.table(["Kind", "Sessions"], d.issueKinds.map((k) => [k.kind, k.n]))}</section>
      <section class="card span-12"><div class="card-h"><h2>Needs attention</h2><a class="meta" href="#/sessions">All sessions</a></div><div id="t-attn"></div></section>
    </div>`;
  const stop = [];
  stop.push(Charts.columns(document.getElementById("c-runs"), d.runs.map((r) => ({ x: shortTs(r.ts).replace(/,.*$/, "") + " " + new Date(r.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), k: r.completed, n: r.sessions, href: `#/run/${r.study}/${r.id}` })), { label: "Task success rate by run" }));
  stop.push(Charts.stacked(document.getElementById("c-outcomes"), d.byPersona.map((r) => ({ label: r.name, values: r })), OUTCOME_SERIES, { label: "Outcomes by persona" }));
  const tasks = d.study.tasks.filter((t) => d.grid.some((c) => c.task === t));
  const personas = d.study.personas.filter((p) => d.grid.some((c) => c.persona === p));
  stop.push(Charts.heat(document.getElementById("c-heat"), personas.map((p) => ({ id: p, label: pn(p) })), tasks.map((t) => ({ id: t, label: t })), (r, c) => {
    const g = d.grid.find((x) => x.persona === r.id && x.task === c.id); if (!g) return null;
    const failed = g.n - g.completed;
    return { rate: failed / g.n, sym: failed ? "✕" : "✓", text: g.n === 1 ? (failed ? "failed" : "done") : `${failed}/${g.n}`, href: `#/session/${g.sessions[0]}`, tv: `${Math.round((failed / g.n) * 100)}% failed`, tl: `${r.label} · ${c.label} · ${failed} of ${g.n} sessions` };
  }, { label: "Failure rate by persona and task" }));
  stop.push(Charts.ranked(document.getElementById("c-kinds"), d.issueKinds.map((k) => ({ label: k.kind.replace(/-/g, " "), n: k.n })), { label: "Issues by kind" }));
  cleanup = () => stop.forEach((f) => f());
  MasterTable(document.getElementById("t-attn"), {
    id: "attn", noun: "sessions", label: "sessions needing attention", rows: d.attention, rowId: (r) => r.id,
    href: (r) => `#/session/${r.id}${r.metrics?.stuckStep != null ? `?step=${r.metrics.stuckStep}` : ""}`,
    search: (r) => `${pn(r.persona)} ${r.task} ${r.outcome.reason}`, sort: { key: "outcome", dir: "asc" },
    columns: [
      { key: "persona", label: "Persona", value: (r) => pn(r.persona), render: (r) => esc(pn(r.persona)) },
      { key: "task", label: "Task" },
      { key: "outcome", label: "Outcome", value: (r) => r.outcome.kind, render: (r) => outcomeBadge(r) },
      { key: "steps", label: "Steps", num: true, value: (r) => r.metrics?.steps, render: (r) => r.metrics?.steps ?? "–" },
      { key: "reason", label: "Last words", wrap: true, value: (r) => r.outcome.reason, render: (r) => `<i>“${esc(r.outcome.reason)}”</i>` },
    ],
  });
}
function outcomeBadge(r) {
  if (r.outcome.kind === "completed" && r.unaware) return `<span class="badge warning">? Completed, didn't know</span>`;
  const m = { completed: ["good", "✓ Completed"], "gave-up": ["critical", "✕ Gave up"], "wrong-done": ["serious", "! Thought done"], "timed-out": ["neutral", "⧗ Timed out"], error: ["neutral", "⚠ Error"] }[r.outcome.kind];
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
}

// ---------- Runs: master table ----------
async function runsPage() {
  crumbs([["Runs", ""]]);
  const runs = await api("/api/runs");
  const studies = [...new Set(runs.map((r) => r.study))];
  app.innerHTML = `<div class="pagehead"><div><h1>Runs</h1><p class="meta">Every run of every study. Click a row to open it; tick two runs of the same study to compare.</p></div></div><div id="t-runs"></div>`;
  const pctBar = (k, n) => n ? `<span class="bar-cell"><span class="track" aria-hidden="true"><div style="width:${(k / n) * 100}%"></div></span>${Math.round((k / n) * 100)}%</span>` : "–";
  MasterTable(document.getElementById("t-runs"), {
    id: "runs", noun: "runs", label: "runs", rows: runs, rowId: (r) => r.id, selectable: true,
    href: (r) => `#/run/${r.study}/${r.id}`, sort: { key: "ts", dir: "desc" },
    search: (r) => `${r.id} ${r.study} ${r.app} ${r.brain}`,
    filters: [
      { key: "study", label: "Study", options: studies.map((s) => [s, s]), test: (r, v) => r.study === v },
      { key: "state", label: "State", options: [["analyzed", "Analyzed"], ["unanalyzed", "Not analyzed"], ["failures", "Has failures"], ["running", "Running"]], test: (r, v) => v === "analyzed" ? r.analyzed : v === "unanalyzed" ? !r.analyzed : v === "failures" ? r.completed < r.sessions : r.status === "running" },
      { key: "size", label: "Size", options: [["full", "5+ sessions"], ["small", "Under 5"]], test: (r, v) => (v === "full" ? r.sessions >= 5 : r.sessions < 5) },
    ],
    actions: (sel) => `<button type="button" data-action="compare" ${sel.length === 2 ? "" : "disabled"} title="Tick two runs of one study">Compare 2</button>`,
    onAction: (name, sel) => {
      if (name !== "compare" || sel.length !== 2) return;
      const [a, b] = sel.map((id) => runs.find((r) => r.id === id)).sort((x, y) => Date.parse(x.ts) - Date.parse(y.ts));
      if (a.study !== b.study) { alert("Pick two runs of the same study."); return; }
      location.hash = `#/run/${b.study}/${b.id}?baseline=${a.id}`;
    },
    columns: [
      { key: "id", label: "Run", render: (r) => esc(r.id) },
      { key: "status", label: "State", value: (r) => `${r.status}${r.analyzed}`, render: (r) => r.status === "running" ? `<span class="badge warning">● Running</span>` : r.analyzed ? `<span class="badge good">✓ Analyzed</span>` : `<span class="badge neutral">Done</span>` },
      { key: "ts", label: "Started", value: (r) => Date.parse(r.ts), render: (r) => shortTs(r.ts) },
      { key: "study", label: "Study" },
      { key: "sessions", label: "Sessions", num: true, title: "personas × tasks × trials", render: (r) => `${r.sessions} <span class="meta">(${r.personas}×${r.tasks}×${r.trials})</span>` },
      { key: "success", label: "Success", num: true, value: (r) => (r.sessions ? r.completed / r.sessions : -1), render: (r) => pctBar(r.completed, r.sessions) },
      { key: "gaveUp", label: "Gave up", num: true },
      { key: "wrongDone", label: "Wrong done", num: true, title: "Believed they finished; they hadn't" },
      { key: "unaware", label: "Unaware", num: true, title: "Finished without knowing it" },
      { key: "issues", label: "Issues", num: true, render: (r) => r.issues == null ? "–" : `${r.issues} <span class="meta">(${r.highIssues} high)</span>` },
      { key: "recall", label: "Planted found", num: true, value: (r) => r.recall ? r.recall.found / r.recall.total : null, render: (r) => r.recall ? `${r.recall.found}/${r.recall.total}` : "–" },
      { key: "medianStepsVsBaseline", label: "Steps × expert", num: true, render: (r) => r.medianStepsVsBaseline != null ? `${r.medianStepsVsBaseline}×` : "–" },
      { key: "costUsd", label: "Cost", num: true, render: (r) => fmtUsd(r.costUsd) },
      { key: "wallMs", label: "Wall time", num: true, render: (r) => fmtDur(r.wallMs) },
      { key: "app", label: "App", render: (r) => `<code>${esc(r.app)}</code>` },
      { key: "brain", label: "Brain", render: (r) => `<code>${esc(r.brain)}</code>` },
    ],
  });
}

// ---------- Sessions: master table ----------
async function sessionsPage(q) {
  crumbs([["Sessions", ""]]);
  const [rows, personas] = [await api("/api/sessions"), await api("/api/personas")];
  const pn = Object.fromEntries(personas.map((p) => [p.persona.id, p.persona.name]));
  const uniq = (f) => [...new Set(rows.map(f))].sort();
  app.innerHTML = `<div class="pagehead"><div><h1>Sessions</h1><p class="meta">One persona attempting one task once. Click a row to watch the replay at the step where they got stuck.</p></div></div><div id="t-sessions"></div>`;
  MasterTable(document.getElementById("t-sessions"), {
    id: "sessions", noun: "sessions", label: "sessions", rows, rowId: (r) => r.id,
    href: (r) => `#/session/${r.id}${r.metrics?.stuckStep != null ? `?step=${r.metrics.stuckStep}` : ""}`, sort: { key: "ts", dir: "desc" },
    search: (r) => `${r.id} ${pn[r.persona] ?? r.persona} ${r.task} ${r.run} ${r.outcome.reason}`,
    filters: [
      { key: "persona", label: "Persona", options: uniq((r) => r.persona).map((p) => [p, pn[p] ?? p]), test: (r, v) => r.persona === v },
      { key: "task", label: "Task", options: uniq((r) => r.task).map((t) => [t, t]), test: (r, v) => r.task === v },
      { key: "outcome", label: "Outcome", options: [["failed", "Any failure"], ["completed", "Completed"], ["unaware", "Completed, didn't know"], ["gave-up", "Gave up"], ["wrong-done", "Thought done"], ["flagged", "Persona flagged"]], test: (r, v) => v === "failed" ? r.outcome.kind !== "completed" : v === "unaware" ? r.unaware : v === "flagged" ? !!r.suspect || (r.judgeFails ?? []).length > 0 : r.outcome.kind === v },
      { key: "run", label: "Run", options: uniq((r) => r.run).reverse().map((x) => [x, x]), test: (r, v) => r.run === v },
    ],
    columns: [
      { key: "persona", label: "Persona", value: (r) => pn[r.persona] ?? r.persona, render: (r) => esc(pn[r.persona] ?? r.persona) },
      { key: "task", label: "Task" },
      { key: "outcome", label: "Outcome", value: (r) => r.outcome.kind + (r.unaware ? "1" : ""), render: (r) => outcomeBadge(r) },
      { key: "steps", label: "Steps", num: true, value: (r) => r.metrics?.steps, render: (r) => r.metrics?.steps ?? "–" },
      { key: "svb", label: "× expert", num: true, value: (r) => r.metrics?.stepsVsBaseline, render: (r) => r.metrics ? `${r.metrics.stepsVsBaseline}×` : "–" },
      { key: "wrong", label: "Wrong turns", num: true, value: (r) => r.metrics?.wrongTurns, render: (r) => r.metrics?.wrongTurns ?? "–" },
      { key: "confused", label: "Confused", num: true, value: (r) => r.metrics?.confusionEvents, render: (r) => r.metrics?.confusionEvents ?? "–" },
      { key: "slips", label: "Slips", num: true, value: (r) => r.metrics?.misclicks, render: (r) => r.metrics?.misclicks ?? "–" },
      { key: "findings", label: "Findings", num: true },
      { key: "flags", label: "Persona checks", value: (r) => (r.judgeFails?.length ?? -1) + (r.suspect ? 1 : 0), render: (r) => r.judgeFails == null ? `<span class="meta">not judged</span>` : r.judgeFails.length || r.suspect ? `<span class="badge serious">! ${esc([...(r.judgeFails ?? []), r.suspect ? "analyst" : ""].filter(Boolean).join(", "))}</span>` : `<span class="badge good">✓ pass</span>` },
      { key: "ts", label: "Started", value: (r) => Date.parse(r.ts), render: (r) => shortTs(r.ts) },
      { key: "costUsd", label: "Cost", num: true, render: (r) => fmtUsd(r.costUsd) },
      { key: "durationMs", label: "Duration", num: true, render: (r) => fmtDur(r.durationMs) },
      { key: "run", label: "Run", render: (r) => `<code>${esc(r.run)}</code>` },
    ],
  });
}

// ---------- Issues: master table ----------
async function issuesPage() {
  crumbs([["Issues", ""]]);
  const rows = await api("/api/issues");
  const kinds = [...new Set(rows.map((r) => r.kind))].sort();
  const sevRank = { high: 3, medium: 2, low: 1 };
  app.innerHTML = `<div class="pagehead"><div><h1>Issues</h1><p class="meta">From the latest analyzed run of each study, merged across personas. Click a row to watch the clearest example.</p></div></div><div id="t-issues"></div>`;
  MasterTable(document.getElementById("t-issues"), {
    id: "issues", noun: "issues", label: "issues", rows, rowId: (r) => `${r.run}:${r.id}`,
    href: (r) => { const f = r.findings.find((x) => x.evidence) ?? r.findings[0]; return f ? `#/session/${f.session}?step=${f.atStep}` : ""; },
    sort: { key: "impact", dir: "desc" }, search: (r) => `${r.title} ${r.summary} ${r.kind} ${r.personaNames.join(" ")}`,
    filters: [
      { key: "sev", label: "Severity", options: [["high", "High"], ["medium", "Medium"], ["low", "Low"]], test: (r, v) => r.severity === v },
      { key: "kind", label: "Kind", options: kinds.map((k) => [k, k]), test: (r, v) => r.kind === v },
      { key: "planted", label: "Planted", options: [["yes", "Matches a planted issue"], ["no", "Not planted"]], test: (r, v) => (v === "yes" ? !!r.known : !r.known) },
    ],
    columns: [
      { key: "title", label: "Issue", wrap: true, render: (r) => `${esc(r.title)}<br><span class="meta" style="font-weight:400">${esc(r.summary)}</span>` },
      { key: "severity", label: "Severity", value: (r) => sevRank[r.severity], render: (r) => `<span class="sev ${esc(r.severity)}">${esc(r.severity)}</span>` },
      { key: "impact", label: "Impact", num: true, title: "severity × sessions affected", value: (r) => sevRank[r.severity] * r.sessions.length, render: (r) => sevRank[r.severity] * r.sessions.length },
      { key: "personas", label: "Personas", num: true, value: (r) => r.personas.length, render: (r) => `<span title="${esc(r.personaNames.join(", "))}">${r.personas.length}</span>` },
      { key: "sessions", label: "Sessions", num: true, value: (r) => r.sessions.length, render: (r) => r.sessions.length },
      { key: "kind", label: "Kind", render: (r) => `<span class="chip">${esc(r.kind)}</span>` },
      { key: "known", label: "Planted", render: (r) => (r.known ? `<span class="chip">${esc(r.known)}</span>` : "–") },
      { key: "who", label: "Who hit it", wrap: true, value: (r) => r.personaNames.join(", "), render: (r) => esc(r.personaNames.join(", ")) },
    ],
  });
}

// ---------- Monitor ----------
async function monitorPage() {
  crumbs([["Monitor", ""]]);
  const d = await api("/api/monitor");
  const rows = d.studies.flatMap((s) => s.signals.map((x, i) => ({ ...x, study: s.id, rid: `${s.id}:${x.id}:${x.scope}:${i}` })));
  app.innerHTML = `<div class="pagehead"><div><h1>Monitor</h1><p class="meta">Signals over each study's last ${d.config.window.runs} runs. Rates fire on the lower bound of their 95% interval, so small samples don't page anyone. Uncertain judge verdicts don't count.</p></div></div>
    <div id="t-signals"></div><h2 class="section-h">Alert history</h2><div id="t-alerts"></div>`;
  MasterTable(document.getElementById("t-signals"), {
    id: "signals", noun: "signals", label: "signals", rows, rowId: (r) => r.rid, sort: { key: "firing", dir: "desc" },
    search: (r) => `${r.id} ${r.scope} ${r.why} ${r.owner}`,
    filters: [{ key: "state", label: "State", options: [["firing", "Firing"], ["ok", "Within threshold"]], test: (r, v) => (v === "firing" ? r.firing : !r.firing) }, { key: "sev", label: "Severity", options: [["high", "High"], ["medium", "Medium"], ["low", "Low"]], test: (r, v) => r.severity === v }],
    columns: [
      { key: "id", label: "Signal", render: (r) => esc(r.id.replace(/_/g, " ")) },
      { key: "firing", label: "State", value: (r) => (r.firing ? 1 : 0), render: (r) => (r.firing ? `<span class="badge critical">✕ Firing</span>` : `<span class="badge good">✓ OK</span>`) },
      { key: "severity", label: "Severity", value: (r) => ({ high: 3, medium: 2, low: 1 })[r.severity], render: (r) => `<span class="sev ${r.severity}">${r.severity}</span>` },
      { key: "scope", label: "Scope" },
      { key: "value", label: "Value", num: true, render: (r) => `${r.value}${r.lo != null ? ` <span class="meta">(≥ ${r.lo})</span>` : ""}` },
      { key: "threshold", label: "Threshold", num: true },
      { key: "n", label: "n", num: true },
      { key: "owner", label: "Owner" },
      { key: "why", label: "Why it matters", wrap: true },
      { key: "study", label: "Study" },
    ],
  });
  MasterTable(document.getElementById("t-alerts"), {
    id: "alerts", noun: "alerts", label: "alerts", rows: d.alerts.map((a, i) => ({ ...a, rid: String(i) })), rowId: (r) => r.rid, sort: { key: "ts", dir: "desc" }, empty: "No alerts recorded yet (usabilify monitor).",
    columns: [
      { key: "ts", label: "When", value: (r) => Date.parse(r.ts), render: (r) => shortTs(r.ts) },
      { key: "id", label: "Signal" }, { key: "scope", label: "Scope" }, { key: "severity", label: "Severity" },
      { key: "value", label: "Value", num: true }, { key: "threshold", label: "Threshold", num: true }, { key: "study", label: "Study" },
    ],
  });
}

function cellHtml(c, sessions, b) {
  if (!c) return `<span class="meta">not run</span>`;
  const ss = c.sessions.map((id) => sessions.find((s) => s.id === id));
  const s0 = ss[0];
  const failed = c.n - c.completed;
  const unaware = ss.some((s) => s.unaware), suspect = ss.some((s) => s.suspect);
  const o = c.n === 1 ? OUT[s0.outcome.kind] : failed ? OUT["gave-up"] : OUT.completed;
  const cls = c.n === 1 && s0.outcome.kind === "completed" && unaware ? "warn" : o.cls;
  const headline = c.n === 1 ? (s0.outcome.kind === "completed" && unaware ? "Completed, didn't know" : o.word) : `${failed}/${c.n} failed`;
  const detail = c.n === 1 ? `${s0.metrics?.steps ?? "?"} steps · ${s0.metrics?.confusionEvents ?? 0} confused` : `${pct(c.failRate)} [${pct(c.lo)}–${pct(c.hi)}]`;
  const stuck = s0.metrics?.stuckStep;
  const href = `#/session/${s0.id}${stuck != null ? `?step=${stuck}` : ""}`;
  const was = b ? (b.n - b.completed ? `was ✕ ${b.n - b.completed}/${b.n} failed` : `was ✓ completed`) : "";
  const change = b ? (c.failRate > b.failRate ? " ▲ worse" : c.failRate < b.failRate ? " ▼ better" : "") : "";
  return `<a class="cell ${cls}" href="${href}"><b><span class="sym" aria-hidden="true">${cls === "warn" ? "?" : o.sym}</span>${esc(headline)}</b><span class="meta">${esc(detail)}${suspect ? " · persona flagged" : ""}</span>${b ? `<span class="meta">${esc(was)}<b style="display:inline">${esc(change)}</b></span>` : ""}</a>`;
}

async function runPage(study, run, baseline) {
  const d = await api(`/api/run/${study}/${run}`);
  const B = baseline ? await api(`/api/run/${study}/${baseline}`) : null;
  const personas = d.study.personas.filter((p) => d.grid.some((c) => c.persona === p));
  const tasks = d.study.tasks.filter((t) => d.grid.some((c) => c.task === t));
  const firing = d.signals.filter((s) => s.firing);
  const attention = d.sessions.filter((s) => s.outcome.kind !== "completed" || s.unaware || s.suspect)
    .sort((a, b) => (a.outcome.kind === "completed") - (b.outcome.kind === "completed"));
  const iss = d.issues;
  app.innerHTML = `
    <h1>${esc(d.study.name)}</h1>
    <p class="meta">Run <code>${esc(d.run.id)}</code> · ${new Date(d.run.ts).toLocaleString()} · app <code>${esc(d.run.app)}</code> · brain <code>${esc(d.run.brain)}</code> · ${d.sessions.length} sessions · $${d.sessions.reduce((a, s) => a + s.costUsd, 0).toFixed(2)}</p>
    ${firing.length ? `<h2>Signals firing</h2><ul>${firing.map((s) => `<li><span class="sev ${s.severity}">${s.severity}</span><b>${esc(s.id)}</b> (${esc(s.scope)}): ${s.value} &gt; ${s.threshold}, n=${s.n}. <span class="meta">${esc(s.why)}</span></li>`).join("")}</ul>` : ""}
    ${B ? `<p class="note">Compared with <a href="#/run/${esc(study)}/${esc(baseline)}">${esc(baseline)}</a>: ${B.sessions.filter((x) => x.outcome.kind === "completed").length}/${B.sessions.length} completed then, ${d.sessions.filter((x) => x.outcome.kind === "completed").length}/${d.sessions.length} now. With one trial per cell, single flips are within noise.</p>` : ""}
    <h2>Personas × tasks</h2>
    <table class="plain grid"><thead><tr><th scope="col">Persona</th>${tasks.map((t) => `<th scope="col" title="${esc(d.tasks[t].goal)}">${esc(t)}</th>`).join("")}</tr></thead><tbody>
    ${personas.map((p) => `<tr><th scope="row"><span class="pname">${esc(d.personas[p].name)}</span><br><span class="chip">${esc(d.personas[p].modality)}</span>${d.personas[p].perception.transforms.map((x) => `<span class="chip">${esc(x.type === "cvd" ? x.kind : x.type)}</span>`).join("")}${d.personas[p].viewport.isMobile ? `<span class="chip">phone</span>` : ""}</th>${tasks.map((t) => `<td>${cellHtml(d.grid.find((c) => c.persona === p && c.task === t), d.sessions, B?.grid.find((c) => c.persona === p && c.task === t))}</td>`).join("")}</tr>`).join("")}
    </tbody></table>
    <p class="meta">Each cell opens the replay at the step where the persona got stuck. ✓ completed · ? completed without realising · ✕ failed.</p>

    <h2>Needs attention (${attention.length})</h2>
    <table class="plain"><thead><tr><th>Persona</th><th>Task</th><th>Outcome</th><th>Last words</th><th></th></tr></thead><tbody>
    ${attention.map((s) => `<tr><td>${esc(d.personas[s.persona]?.name ?? s.persona)}</td><td>${esc(s.task)}</td><td>${esc(OUT[s.outcome.kind].word)}${s.unaware ? ", didn't realise it worked" : ""}${s.suspect ? `<br><span class="meta">persona flagged: ${esc(s.suspect)}</span>` : ""}</td><td><i>“${esc(s.outcome.reason)}”</i></td><td><a href="#/session/${s.id}${s.metrics?.stuckStep != null ? `?step=${s.metrics.stuckStep}` : ""}">Watch</a></td></tr>`).join("")}
    </tbody></table>

    <h2>Issues ${iss ? `(${iss.issues.length})` : ""}</h2>
    ${iss ? `<div class="issues">${iss.issues.map((i) => `
      <div class="issue"><h3><span class="sev ${esc(i.severity)}">${esc(i.severity)}</span>${esc(i.title)} ${i.known ? `<span class="chip">planted ${esc(i.known)}</span>` : ""}</h3>
      <div>${esc(i.summary)}</div>
      <div class="meta">${i.personas.length} personas (${i.personas.map((p) => esc(d.personas[p]?.name ?? p)).join(", ")}) · ${i.sessions.length} sessions · ${esc(i.kind)}</div>
      ${i.findings.filter((f) => f.evidence).slice(0, 2).map((f) => `<blockquote>“${esc(unq(f.evidence))}” — <a href="#/session/${f.session}?step=${f.atStep}">${esc(d.personas[f.persona]?.name ?? f.persona)}, step ${f.atStep}</a></blockquote>`).join("")}
      </div>`).join("")}</div>` : `<p class="note">Not analyzed yet. Run <code>usabilify analyze ${esc(study)} ${esc(run)}</code>.</p>`}

    ${d.known.length && iss?.perKnown ? `<h2>Planted issues: recall ${iss.recall.found}/${iss.recall.total}</h2>
    <p class="meta">This fixture has known problems planted on purpose. A calibration target, not a real-world validity claim.</p>
    <table class="plain"><thead><tr><th>Id</th><th>Planted problem</th><th>Surfaced by</th><th>Expected from</th></tr></thead><tbody>
    ${d.known.map((k) => { const pk = iss.perKnown.find((x) => x.id === k.id); const found = pk.surfacedBy.length; return `<tr><td>${esc(k.id)}</td><td>${found ? "✓" : "✕ missed"} ${esc(k.title)}</td><td>${pk.surfacedBy.map((p) => esc(d.personas[p]?.name ?? p)).join(", ") || "–"}</td><td class="meta">${pk.expected.map((p) => esc(d.personas[p]?.name ?? p)).join(", ")}</td></tr>`; }).join("")}
    </tbody></table>` : ""}`;
}

// ---------- Session ----------
function actText(a) {
  switch (a.type) {
    case "click": return `click (${a.x}, ${a.y})`;
    case "type": return `type “${a.text}”`;
    case "press": return `press ${a.key}`;
    case "select": return `choose “${a.option}”`;
    case "scroll": return `scroll ${a.dy > 0 ? "down" : "up"}`;
    case "activate": return `activate [${a.ref}]`;
    case "fill": return `fill [${a.ref}] “${a.text}”`;
    case "give_up": return "gives up";
    case "done": return "says done";
    default: return a.type;
  }
}
function stepState(s) {
  if (s.events.some((e) => e === "dead" || e === "wrong-turn" || e.startsWith("refused") || e === "missed-transient")) return { cls: "bad", sym: "✕" };
  if (["unsure", "stuck", "lost"].includes(s.feeling) || s.events.includes("misclick") || s.events.includes("backtrack")) return { cls: "warn", sym: "?" };
  return { cls: "ok", sym: "✓" };
}
const EVENT_WORDS = (e) => e === "dead" ? "nothing happened" : e === "wrong-turn" ? "wrong turn" : e === "misclick" ? "slipped" : e === "missed-transient" ? "missed a message" : e.startsWith("navigated:") ? `→ ${e.slice(10)}` : e.startsWith("transient:") ? `message: “${e.slice(10)}”` : e.startsWith("focus:") ? `focus: ${e.slice(6)}` : e.startsWith("refused:") ? `couldn't: ${e.slice(8)}` : e.startsWith("dropdown-open:") ? "dropdown opened" : e;

async function sessionPage(id, q) {
  let d = await api(`/api/session/${id}`);
  const t = d.trace, p = d.persona;
  crumbs([["Sessions", "#/sessions"], [d.run, `#/run/${d.study}/${d.run}`], [`${p.name} · ${t.task}`, ""]]);
  const lens = q.get("lens") || (p.modality === "screen-reader" || t.steps.some((s) => s.view) ? "split" : "plain");
  const o = OUT[t.outcome.kind];
  const unaware = t.events.some((e) => e.type === "unaware-of-success");
  app.innerHTML = `
    <h1>${esc(p.name)} · ${esc(t.task)}</h1>
    <p>${esc(d.task.goal)}</p>
    <p class="row"><span class="cell ${unaware && t.outcome.kind === "completed" ? "warn" : o.cls}" style="width:auto;min-height:0;display:inline-block"><span class="sym" aria-hidden="true">${o.sym}</span><b style="display:inline">${esc(o.word)}${unaware ? ", didn't realise" : ""}</b></span>
      <span class="stat">${t.metrics?.steps ?? t.steps.length} steps (expert ${d.task.baseline.steps})</span><span class="stat">${t.metrics?.wrongTurns ?? 0} wrong turns</span><span class="stat">${t.metrics?.confusionEvents ?? 0} confused</span><span class="stat">${t.metrics?.misclicks ?? 0} slips</span><span class="stat">${(t.durationMs / 1000).toFixed(0)}s · $${t.costUsd.toFixed(3)}</span></p>
    <div class="cols">
      <div>
        <div class="stagewrap" id="stagewrap"><div id="host"></div></div>
        <div class="scrubrow"><input type="range" id="scrub" min="0" max="1000" value="0" aria-label="Replay position"><span id="time" class="meta" aria-live="off" style="min-width:52px">0:00</span></div>
        <div class="marks" id="marks" aria-label="Steps"></div>
        <div class="controls">
          <button id="play" class="primary" aria-label="Play">▶ Play</button>
          <span role="radiogroup" aria-label="Lens">${["plain", "split", "persona"].map((l) => `<a class="btn" ${l === lens ? 'aria-current="true" style="font-weight:700"' : ""} href="#/session/${id}?lens=${l}">${l}</a>`).join(" ")}</span>
          ${t.metrics?.stuckStep != null ? `<button id="stuck">Jump to stuck step</button>` : ""}
        </div>
        <p class="meta" id="voicestatus"></p>
        <div class="row">
          <button id="export">Export ${lens} MP4</button>
          ${d.mp4.map((l) => `<a class="btn" href="/files/${id}/replay/${l}.mp4" download>Download ${l}.mp4</a>`).join("")}
          <a class="btn" href="/files/${id}/playwright-trace.zip" download>Playwright trace</a>
          <span class="meta" id="exportstatus"></span>
        </div>
        <h2>Findings</h2>
        ${(t.findings ?? []).length ? `<div class="issues">${t.findings.map((f) => `<div class="issue"><h3><span class="sev ${esc(f.severity)}">${esc(f.severity)}</span>${esc(f.title)}</h3><div>${esc(f.note)}</div><div class="meta">${esc(f.kind)} · <a href="#" data-seek-step="${f.atStep}">step ${f.atStep}</a></div></div>`).join("")}</div>` : `<p class="meta">Not analyzed yet.</p>`}
        ${t.events.find((e) => e.type === "suspect") ? `<p class="note">The analyst flagged this persona: ${esc(t.events.find((e) => e.type === "suspect").reason)}</p>` : ""}
        <h2>Label this session</h2>
        <form id="label" class="panel"></form>
      </div>
      <aside>
        <div class="panel"><h3>${esc(p.name)}</h3><p class="meta">${esc(p.summary)}</p><p class="meta">${esc(p.context)}</p></div>
        <h2>Transcript</h2>
        <ol class="transcript" id="transcript">${t.steps.map((s) => { const st = stepState(s); return `<li><button data-step="${s.i}"><span class="meta"><span class="sym ${st.cls}" aria-hidden="true">${st.sym}</span>${fmtTime(s.t)} · step ${s.i} · ${esc(s.feeling)}</span><span class="say">“${esc(s.say)}”</span><span class="act">${esc(actText(s.act))}${s.events.filter((e) => !e.startsWith("transient")).length ? " · " + s.events.filter((e) => e !== "final-look").map(EVENT_WORDS).map(esc).join(" · ") : ""}</span></button></li>`; }).join("")}</ol>
      </aside>
    </div>`;

  // Voice first (cached after the first time), so the timeline uses real line lengths.
  const vs = document.getElementById("voicestatus");
  if (!d.voice || !d.track) {
    vs.textContent = "Preparing the persona's voice…";
    try { await api(`/api/session/${id}/voice`, { method: "POST" }); d = await api(`/api/session/${id}`); vs.textContent = ""; }
    catch (e) { vs.textContent = `Voice unavailable (${e.message}); playing silently with captions.`; }
  }
  const host = document.getElementById("host"), wrap = document.getElementById("stagewrap");
  const player = new UsabPlayer(host, { trace: d.trace, persona: p, task: d.task, durations: d.voice?.durations ?? {}, lens, files: `/files/${id}`, findings: d.trace.findings });
  const fit = () => { const s = wrap.clientWidth / 1920; player.el.style.transform = `scale(${s})`; wrap.style.height = `${1080 * s}px`; };
  fit(); window.addEventListener("resize", fit);
  const audio = d.track ? new Audio(`/files/${id}/replay/track.wav?h=${d.voice.hash}`) : null;
  let time = 0, playing = false, last = 0, raf = 0;
  const dur = player.duration;
  const scrub = document.getElementById("scrub"), timeEl = document.getElementById("time"), playBtn = document.getElementById("play");
  const segs = player.tl.segs;
  const marks = document.getElementById("marks");
  marks.innerHTML = segs.map((sg, k) => { const st = stepState(t.steps[k]); return `<button class="mark ${st.cls}" style="left:${(sg.start / dur) * 100}%" data-step="${t.steps[k].i}" title="Step ${t.steps[k].i}: ${esc(t.steps[k].say)}" aria-label="Step ${t.steps[k].i}, ${st.cls === "ok" ? "fine" : st.cls === "warn" ? "unsure" : "problem"}">${st.sym}</button>`; }).join("");
  let currentStep = -1;
  const draw = () => {
    player.render(time);
    scrub.value = String(Math.round((time / dur) * 1000));
    timeEl.textContent = fmtTime(time);
    const k = Math.max(0, segs.findIndex((s) => time < s.end));
    const si = t.steps[k < 0 ? t.steps.length - 1 : k].i;
    if (si !== currentStep) {
      currentStep = si;
      document.querySelectorAll("[data-step]").forEach((b) => b.dataset.step == si ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"));
      const li = document.querySelector(`#transcript [data-step="${si}"]`);
      if (li && playing) li.scrollIntoView({ block: "nearest" });
    }
  };
  const tick = (now) => {
    if (!playing) return;
    if (audio && !audio.paused) time = audio.currentTime; else time += (now - last) / 1000;
    last = now;
    if (time >= dur) { time = dur; pause(); }
    draw();
    raf = requestAnimationFrame(tick);
  };
  const play = () => { if (time >= dur - 0.05) time = 0; playing = true; last = performance.now(); if (audio) { audio.currentTime = Math.min(time, audio.duration || time); audio.play().catch(() => {}); } playBtn.textContent = "❚❚ Pause"; playBtn.setAttribute("aria-label", "Pause"); raf = requestAnimationFrame(tick); };
  const pause = () => { playing = false; audio?.pause(); cancelAnimationFrame(raf); playBtn.textContent = "▶ Play"; playBtn.setAttribute("aria-label", "Play"); };
  const seek = (x) => { time = Math.max(0, Math.min(dur, x)); if (audio) audio.currentTime = Math.min(time, audio.duration || time); draw(); };
  const seekStep = (i) => { const k = t.steps.findIndex((s) => s.i === Number(i)); if (k >= 0) seek(segs[k].speakStart); };
  playBtn.onclick = () => (playing ? pause() : play());
  scrub.oninput = () => seek((scrub.value / 1000) * dur);
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-step]"); if (b && !b.closest("form")) { seekStep(b.dataset.step); return; }
    const f = e.target.closest("[data-seek-step]"); if (f) { e.preventDefault(); seekStep(f.dataset.seekStep); }
  });
  document.getElementById("stuck")?.addEventListener("click", () => seekStep(t.metrics.stuckStep));
  const onKey = (e) => { if (e.target.closest("input,textarea")) return; if (e.key === " ") { e.preventDefault(); playing ? pause() : play(); } if (e.key === "ArrowRight") seek(time + 2); if (e.key === "ArrowLeft") seek(time - 2); };
  document.addEventListener("keydown", onKey);
  // Read-only hook for the walkthrough recorder: the replay's clock, its segments and the voice track.
  window.__replay = { get time() { return time; }, get playing() { return playing; }, segs, track: d.track ? `${d.trace.id}` : null };
  cleanup = () => { pause(); delete window.__replay; document.removeEventListener("keydown", onKey); window.removeEventListener("resize", fit); };
  // Open at the stuck step (or the one asked for), not at the start.
  const startStep = q.get("step") ?? t.metrics?.stuckStep;
  if (startStep != null) seekStep(startStep); else draw();

  document.getElementById("export").onclick = async () => {
    const es = document.getElementById("exportstatus"); es.textContent = "Rendering MP4…";
    try { const r = await api(`/api/session/${id}/render?lens=${lens}`, { method: "POST" }); es.innerHTML = `Done: <a href="/files/${id}/replay/${lens}.mp4" download>${lens}.mp4</a>`; }
    catch (e) { es.textContent = `Export failed: ${e.message}`; }
  };
  labelForm(d, id);
}

function labelForm(d, id) {
  const form = document.getElementById("label");
  const crit = d.rubric.criteria;
  const judged = d.trace.judge;
  const already = d.labels.length > 0;
  const showJudge = () => judged ? `<h3>Judge verdicts</h3><ul>${Object.entries(judged.verdicts).map(([k, v]) => `<li><b>${esc(k)}</b>: ${v.pass ? "pass" : "fail"} (p=${v.p}${v.uncertain ? ", uncertain" : ""}, ${esc(v.by)})${v.note ? ` <span class="meta">${esc(v.note)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="meta">No judge verdicts yet (usabilify judge).</p>`;
  form.innerHTML = `<p class="meta">Blind labelling: judge verdicts stay hidden until you save. ${already ? `${d.labels.length} labels saved for this session already.` : ""}</p>
    ${Object.entries(crit).map(([k, c]) => `<fieldset><legend>${esc(k)}</legend><div class="crit-def">Pass: ${esc(c.pass)}<br>Fail: ${esc(c.fail)}</div>
      <label><input type="radio" name="${k}" value="pass"> pass</label> <label><input type="radio" name="${k}" value="fail"> fail</label> <label><input type="radio" name="${k}" value="" checked> skip</label>
      <input name="${k}-note" placeholder="note (optional)" style="width:100%;margin-top:4px" aria-label="${esc(k)} note"></fieldset>`).join("")}
    <label>Your name <input name="by" value="${esc(localStorage.getItem("labeller") || "")}" required></label> <button class="primary">Save labels</button>
    <div id="judgeout">${already ? showJudge() : ""}</div>`;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form), labels = {};
    for (const k of Object.keys(crit)) { const v = fd.get(k); if (v) labels[k] = { pass: v === "pass", note: fd.get(`${k}-note`) }; }
    try { localStorage.setItem("labeller", fd.get("by")); } catch {}
    await api("/api/label", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: id, by: fd.get("by"), labels }) });
    document.getElementById("judgeout").innerHTML = `<p>Saved ${Object.keys(labels).length} labels.</p>` + showJudge();
  };
}

// ---------- Personas ----------
const DEVICES = {
  desktop: { label: "Desktop 1280×800", v: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  laptop: { label: "Laptop 1440×900", v: { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false } },
  zoom200: { label: "Desktop at 200% zoom", v: { width: 640, height: 400, deviceScaleFactor: 2, isMobile: false, hasTouch: false } },
  phone: { label: "Phone 390×844", v: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  tablet: { label: "Tablet 820×1180", v: { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
};
const deviceOf = (v) => Object.entries(DEVICES).find(([, d]) => d.v.width === v.width && d.v.height === v.height && !!d.v.isMobile === !!v.isMobile)?.[0] ?? "custom";
const deviceLabel = (v) => DEVICES[deviceOf(v)]?.label ?? `${v.width}×${v.height}${v.isMobile ? " touch" : ""}`;
const visionText = (p) => p.modality === "screen-reader" ? "blind" : p.perception.transforms.map((x) => x.type === "cvd" ? `${x.kind}${x.severity < 1 ? ` ${x.severity}` : ""}` : x.type === "blur" ? `blur ${x.sigma}px` : `contrast ×${x.amount}`).join(", ") || "typical";
const MODALITY = { sighted: "Mouse or touch", keyboard: "Keyboard only", "screen-reader": "Screen reader" };
const passRate = (r) => (r ? `${r.pass}/${r.n}` : "–");

async function personasPage() {
  crumbs([["Personas", ""]]);
  const ps = await api("/api/personas");
  const studies = [...new Set(ps.flatMap((x) => x.studies))].sort();
  app.innerHTML = `<div class="pagehead"><div><h1>Personas</h1><p class="meta">Each persona is a way of perceiving, an input method, a knowledge level, a patience budget and a voice. Click one to see its sessions and checks.</p></div>
    <div class="row"><a class="btn primary" href="#/personas/new">＋ New persona</a></div></div><div id="t-personas"></div>`;
  MasterTable(document.getElementById("t-personas"), {
    id: "personas", noun: "personas", label: "personas", rows: ps, rowId: (r) => r.persona.id,
    href: (r) => `#/persona/${r.persona.id}`, sort: { key: "name", dir: "asc" },
    search: (r) => `${r.persona.name} ${r.persona.id} ${r.persona.summary} ${visionText(r.persona)} ${r.persona.voice.tts}`,
    filters: [
      { key: "modality", label: "Input", options: Object.entries(MODALITY), test: (r, v) => r.persona.modality === v },
      { key: "vision", label: "Vision", options: [["typical", "Typical"], ["cvd", "Color vision deficiency"], ["low", "Low vision / blur"], ["blind", "Blind"]], test: (r, v) => v === "typical" ? r.persona.modality !== "screen-reader" && !r.persona.perception.transforms.length : v === "cvd" ? r.persona.perception.transforms.some((x) => x.type === "cvd") : v === "low" ? r.persona.perception.transforms.some((x) => x.type === "blur") : r.persona.modality === "screen-reader" },
      { key: "study", label: "Study", options: studies.map((x) => [x, x]), test: (r, v) => r.studies.includes(v) },
    ],
    columns: [
      { key: "name", label: "Persona", value: (r) => r.persona.name, render: (r) => `${esc(r.persona.name)}${r.persona.role === "control" ? ` <span class="chip">control</span>` : ""}` },
      { key: "who", label: "Who", wrap: true, value: (r) => r.persona.summary, render: (r) => `<span class="clamp2" title="${esc(r.persona.summary)}">${esc(r.persona.summary)}</span>` },
      { key: "modality", label: "Input", value: (r) => r.persona.modality, render: (r) => esc(MODALITY[r.persona.modality]) },
      { key: "vision", label: "Vision", value: (r) => visionText(r.persona), render: (r) => esc(visionText(r.persona)) },
      { key: "device", label: "Device", value: (r) => deviceLabel(r.persona.viewport), render: (r) => esc(deviceLabel(r.persona.viewport)) },
      { key: "web", label: "Web skill", value: (r) => ({ novice: 0, fluent: 1, expert: 2 })[r.persona.knowledge.web], render: (r) => esc(r.persona.knowledge.web) },
      { key: "patience", label: "Patience", num: true, value: (r) => r.persona.patience.budget, render: (r) => r.persona.patience.budget },
      { key: "sessions", label: "Sessions", num: true },
      { key: "success", label: "Success", num: true, value: (r) => (r.sessions ? r.completed / r.sessions : -1), render: (r) => r.sessions ? `<span class="bar-cell"><span class="track" aria-hidden="true"><div style="width:${(r.completed / r.sessions) * 100}%"></div></span>${Math.round((r.completed / r.sessions) * 100)}%</span>` : "–" },
      { key: "gaveUp", label: "Gave up", num: true },
      { key: "checks", label: "Persona checks", value: (r) => r.suspect, render: (r) => r.sessions ? (r.suspect ? `<span class="badge serious">! ${r.suspect} flagged</span>` : `<span class="badge good">✓ none flagged</span>`) : `<span class="meta">no sessions</span>` },
      { key: "realism", label: "Realism", num: true, title: "judge pass / judged", value: (r) => (r.judge.realism ? r.judge.realism.pass / r.judge.realism.n : null), render: (r) => passRate(r.judge.realism) },
      { key: "voice", label: "Voice", value: (r) => r.persona.voice.tts, render: (r) => `<code>${esc(r.persona.voice.tts)}</code>` },
      { key: "studies", label: "Studies", value: (r) => r.studies.join(","), render: (r) => r.studies.map((x) => `<span class="chip">${esc(x)}</span>`).join("") || `<span class="meta">none</span>` },
      { key: "lastRun", label: "Last run", value: (r) => (r.lastRun ? Date.parse(r.lastRun) : null), render: (r) => (r.lastRun ? shortTs(r.lastRun) : "–") },
    ],
  });
}

async function personaPage(id) {
  const d = await api(`/api/personas/${id}`);
  const p = d.persona;
  crumbs([["Personas", "#/personas"], [p.name, ""]]);
  const T = p.perception.transforms;
  const dl = (rows) => `<dl class="props">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  app.innerHTML = `
    <div class="pagehead"><div><h1>${esc(p.name)} ${p.role === "control" ? `<span class="chip">control</span>` : ""}</h1><p>${esc(p.summary)}</p><p class="meta"><code>${esc(p.id)}</code> · in ${d.studies.map(esc).join(", ") || "no studies"}</p></div>
      <div class="row"><a class="btn" href="#/personas/new?from=${esc(p.id)}">Duplicate</a><a class="btn primary" href="#/persona/${esc(p.id)}/edit">Edit</a></div></div>
    <section class="tiles" style="grid-template-columns:repeat(5,minmax(0,1fr))">
      <div class="tile"><div class="label">Sessions</div><div class="value">${d.sessions}</div></div>
      <div class="tile"><div class="label">Task success</div><div class="value">${d.sessions ? Math.round((d.completed / d.sessions) * 100) + "%" : "–"}</div><div class="sub">${d.completed} of ${d.sessions}</div></div>
      <div class="tile"><div class="label">Gave up</div><div class="value">${d.gaveUp}</div></div>
      <div class="tile"><div class="label">Persona flagged</div><div class="value">${d.suspect}</div><div class="sub">by the analyst for acting out of character</div></div>
      <div class="tile"><div class="label">Words per line</div><div class="value">${d.medianWords ?? "–"}</div><div class="sub">median; real think-aloud is short</div></div>
    </section>
    <div class="dash" style="margin-top:16px">
      <section class="card span-6"><div class="card-h"><h2>Definition</h2></div>
        ${dl([
          ["Situation", esc(p.context)], ["Temperament", esc(p.temperament)],
          ["Input", esc(MODALITY[p.modality])], ["Device", esc(deviceLabel(p.viewport))],
          ["Vision", esc(visionText(p))], ["Pointer", p.modality === "sighted" ? `aim error σ ${p.input.misclick.sigmaPx}px, slips ${Math.round(p.input.misclick.p * 100)}%` : "–"],
          ["Web skill", esc(p.knowledge.web)], ["This kind of app", esc(p.knowledge.domain)],
          ["Used to", p.knowledge.conventions.map((c) => `<span class="chip">${esc(c)}</span>`).join("") || "–"],
          ["Doesn't know", p.knowledge.unknown.map((c) => `<span class="chip">${esc(c)}</span>`).join("") || "–"],
          ["Patience", `budget ${p.patience.budget} · wrong turn −${p.patience.wrongTurnCost} · dead click −${p.patience.deadClickCost} · slow load −${p.patience.slowLoadCost} · progress +${p.patience.progressGain}`],
          ["Voice", `<code>${esc(p.voice.tts)}</code> at ${p.voice.speed}×`],
        ])}</section>
      <section class="card span-6"><div class="card-h"><h2>What ${esc(p.name)} sees</h2><span class="meta" id="pv-where"></span></div>
        <div id="pv" class="pv"><button type="button" id="pv-go">Show the study's start page through ${esc(p.name)}'s eyes</button></div>
        <h2 style="margin:16px 0 8px">Voice</h2>
        <ul class="samples">${d.voiceSamples.split("\n").filter(Boolean).map((l) => `<li><button type="button" class="play-line" data-line="${esc(l)}" aria-label="Play">▶</button> “${esc(l)}”</li>`).join("") || `<li class="meta">No sample lines.</li>`}</ul>
        <p class="meta">Sample lines are authored, not from real sessions. Replace them with real think-aloud excerpts when you have them.</p></section>
      <section class="card span-12"><div class="card-h"><h2>Sessions</h2><span class="meta">judge: realism ${passRate(d.judge.realism)} · grounded ${passRate(d.judge.grounded)} · consistent ${passRate(d.judge.consistent)} · voice ${passRate(d.judge.voice)} · Turing ${d.turing ? `${d.turing.caught}/${d.turing.n} caught` : "no guesses"}</span></div><div id="t-psess"></div></section>
    </div>`;
  document.getElementById("pv-go").onclick = () => showPreview(p, document.getElementById("pv"), document.getElementById("pv-where"));
  wireVoiceButtons(app, p.voice);
  MasterTable(document.getElementById("t-psess"), {
    id: "persona-sessions", noun: "sessions", rows: d.sessionsList, rowId: (r) => r.id, empty: "This persona hasn't run yet.",
    href: (r) => `#/session/${r.id}${r.metrics?.stuckStep != null ? `?step=${r.metrics.stuckStep}` : ""}`, sort: { key: "ts", dir: "desc" },
    search: (r) => `${r.task} ${r.run} ${r.outcome.reason}`,
    columns: [
      { key: "task", label: "Task" },
      { key: "outcome", label: "Outcome", value: (r) => r.outcome.kind, render: (r) => outcomeBadge(r) },
      { key: "steps", label: "Steps", num: true, value: (r) => r.metrics?.steps, render: (r) => r.metrics?.steps ?? "–" },
      { key: "reason", label: "Last words", wrap: true, value: (r) => r.outcome.reason, render: (r) => `<i>“${esc(r.outcome.reason)}”</i>` },
      { key: "ts", label: "Started", value: (r) => Date.parse(r.ts), render: (r) => shortTs(r.ts) },
      { key: "run", label: "Run", render: (r) => `<code>${esc(r.run)}</code>` },
    ],
  });
}

async function showPreview(persona, box, where, study) {
  box.innerHTML = `<p class="meta">Opening the app as ${esc(persona.name || "this persona")}…</p>`;
  try {
    const r = await api("/api/persona-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ persona, study }) });
    if (where) where.textContent = r.url;
    box.innerHTML = r.buffer != null
      ? `<div class="pv-pair ${persona.viewport.width > persona.viewport.height ? "wide" : ""}"><figure><figcaption>On screen</figcaption><img alt="The page as rendered" src="data:image/png;base64,${r.real}"></figure><figure><figcaption>What the screen reader says</figcaption><pre class="buffer">${esc(r.buffer)}</pre></figure></div>`
      : `<div class="pv-pair ${persona.viewport.width > persona.viewport.height ? "wide" : ""}"><figure><figcaption>On screen</figcaption><img alt="The page as rendered" src="data:image/png;base64,${r.real}"></figure><figure><figcaption>What ${esc(persona.name || "they")} see${persona.name ? "s" : ""}</figcaption><img alt="The page as this persona perceives it" src="data:image/png;base64,${r.view}"></figure></div>`;
  } catch (e) { box.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
}

function wireVoiceButtons(root, voice) {
  root.querySelectorAll(".play-line").forEach((b) => (b.onclick = async () => {
    const v = typeof voice === "function" ? voice() : voice;
    b.disabled = true; b.textContent = "…";
    try { const r = await api("/api/voice-preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ voice: v.tts, speed: v.speed, text: b.dataset.line }) }); await new Audio(r.url).play(); }
    catch (e) { alert(e.message); }
    finally { b.disabled = false; b.textContent = "▶"; }
  }));
}

const NEW_PERSONA = {
  id: "", name: "", role: "persona", summary: "", context: "", temperament: "",
  modality: "sighted", viewport: { ...DEVICES.desktop.v }, perception: { transforms: [] }, input: { misclick: { sigmaPx: 4, p: 0.02 } },
  knowledge: { web: "fluent", domain: "none", conventions: ["settings behind a gear"], unknown: [] },
  patience: { budget: 7, wrongTurnCost: 1, deadClickCost: 1, slowLoadCost: 0.5, progressGain: 0.5 }, voice: { tts: "af_heart", speed: 1 },
};
const slug = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

async function personaForm(id, fromId) {
  const meta = await api("/api/persona-meta");
  const editing = !!id;
  const src = id || fromId ? await api(`/api/personas/${id || fromId}`) : null;
  let p = structuredClone(src ? src.persona : NEW_PERSONA);
  let samples = src ? src.voiceSamples : "";
  let studies = editing ? src.studies : fromId ? src.studies : meta.studies.map((s) => s.id);
  if (fromId) { p.name = `${p.name} (copy)`; p.id = slug(p.name); }
  crumbs(editing ? [["Personas", "#/personas"], [p.name, `#/persona/${id}`], ["Edit", ""]] : [["Personas", "#/personas"], ["New persona", ""]]);
  const T = (type) => p.perception.transforms.find((x) => x.type === type);
  const opt = (pairs, cur) => pairs.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(t)}</option>`).join("");
  app.innerHTML = `
    <div class="pagehead"><div><h1>${editing ? `Edit ${esc(p.name)}` : "New persona"}</h1><p class="meta">A persona changes what the model perceives and how it can act, not just how it talks. Changes apply to the next run; past sessions keep the version they ran with.</p></div></div>
    <form id="pf" class="pform" novalidate>
      <div class="pform-main">
        ${editing ? "" : `<fieldset class="card"><legend>Start from a description <span class="meta">(optional)</span></legend>
          <label for="desc">Describe the person in a sentence or two. Claude drafts the fields below for you to check.</label>
          <textarea id="desc" rows="2" placeholder="e.g. A 66-year-old nurse with cataracts who mostly uses an iPad and gets flustered by pop-ups"></textarea>
          <div class="row"><button type="button" id="draft">Draft with Claude</button><span class="meta" id="draft-status" aria-live="polite"></span></div></fieldset>`}
        <fieldset class="card"><legend>Who they are</legend>
          <div class="f2"><label>Name<input name="name" required value="${esc(p.name)}"></label>
            <label>Id<input name="id" required pattern="[a-z0-9][a-z0-9-]{1,40}" value="${esc(p.id)}" ${editing ? "readonly" : ""} aria-describedby="id-help"><span class="help" id="id-help">${editing ? "Ids can't change; duplicate instead." : "Lowercase letters, digits and dashes. Filled from the name."}</span></label></div>
          <label>Summary<textarea name="summary" rows="2" required placeholder="Age, job, how they use computers.">${esc(p.summary)}</textarea></label>
          <label>Situation right now<textarea name="context" rows="2" placeholder="Second person: where they are, how much time they have, what's on their mind.">${esc(p.context)}</textarea></label>
          <label>Temperament and way of talking<textarea name="temperament" rows="2" placeholder="How they react and how they sound when thinking aloud.">${esc(p.temperament)}</textarea></label>
          <label class="inline"><input type="checkbox" name="control" ${p.role === "control" ? "checked" : ""}> Control persona (the baseline others are compared with)</label>
        </fieldset>
        <fieldset class="card"><legend>How they use the app</legend>
          <div class="seg" role="radiogroup" aria-label="Input">${Object.entries(MODALITY).map(([v, t]) => `<label><input type="radio" name="modality" value="${v}" ${p.modality === v ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>
          <div class="f2"><label>Device<select name="device">${opt([...Object.entries(DEVICES).map(([k, d]) => [k, d.label]), ["custom", "Custom size"]], deviceOf(p.viewport))}</select></label>
            <div class="f2" id="custom-size"><label>Width<input name="vw" type="number" min="320" max="2560" value="${p.viewport.width}"></label><label>Height<input name="vh" type="number" min="320" max="2000" value="${p.viewport.height}"></label></div></div>
          <div class="f2" data-only="sighted"><label>Aim error <output name="o-sigma">${p.input.misclick.sigmaPx}px</output><input name="sigma" type="range" min="0" max="14" step="1" value="${p.input.misclick.sigmaPx}"><span class="help">How far a click lands from where they aim. Mouse 2–5, thumb 8–11.</span></label>
            <label>Slips <output name="o-slip">${Math.round(p.input.misclick.p * 100)}%</output><input name="slip" type="range" min="0" max="0.1" step="0.01" value="${p.input.misclick.p}"><span class="help">Chance a click lands on a neighbouring target.</span></label></div>
        </fieldset>
        <fieldset class="card" data-hide="screen-reader"><legend>Vision</legend>
          <div class="f2"><label>Color vision<select name="cvd">${opt([["", "Typical"], ["deutan", "Deuteranopia (red-green, most common)"], ["protan", "Protanopia (red-green)"], ["tritan", "Tritanopia (blue-yellow)"]], T("cvd")?.kind ?? "")}</select></label>
            <label>Severity <output name="o-sev">${T("cvd")?.severity ?? 1}</output><input name="sev" type="range" min="0.1" max="1" step="0.1" value="${T("cvd")?.severity ?? 1}"></label></div>
          <div class="f2"><label>Blur <output name="o-blur">${T("blur")?.sigma ?? 0}px</output><input name="blur" type="range" min="0" max="3" step="0.1" value="${T("blur")?.sigma ?? 0}"><span class="help">0.4–0.8 for ageing eyes; 1.5–2.5 for low vision.</span></label>
            <label>Contrast <output name="o-contrast">×${T("contrast")?.amount ?? 1}</output><input name="contrast" type="range" min="0.3" max="1" step="0.05" value="${T("contrast")?.amount ?? 1}"><span class="help">Below 1 makes faint things fainter.</span></label></div>
        </fieldset>
        <fieldset class="card"><legend>What they know</legend>
          <div class="f2"><label>With the web<select name="web">${opt([["novice", "Beginner"], ["fluent", "Comfortable"], ["expert", "Very experienced"]], p.knowledge.web)}</select></label>
            <label>With this kind of app<select name="domain">${opt([["none", "Never used one"], ["some", "Used something like it"], ["expert", "Uses lots of them"]], p.knowledge.domain)}</select></label></div>
          <div class="f2"><label>Used to (one per line)<textarea name="conventions" rows="3" placeholder="settings behind a gear">${esc(p.knowledge.conventions.join("\n"))}</textarea></label>
            <label>Doesn't know (one per line)<textarea name="unknown" rows="3" placeholder="that a plus sign adds something">${esc(p.knowledge.unknown.join("\n"))}</textarea></label></div>
        </fieldset>
        <fieldset class="card"><legend>Patience</legend>
          <label>Budget <output name="o-budget">${p.patience.budget}</output><input name="budget" type="range" min="3" max="12" step="0.5" value="${p.patience.budget}"><span class="help">Wrong turns, dead clicks and slow loads spend it; progress gives a little back. They're told how they feel, never the number.</span></label>
          <details><summary>Costs</summary><div class="f4">
            <label>Wrong turn<input name="wrongTurnCost" type="number" step="0.1" min="0" value="${p.patience.wrongTurnCost}"></label>
            <label>Dead click<input name="deadClickCost" type="number" step="0.1" min="0" value="${p.patience.deadClickCost}"></label>
            <label>Slow load<input name="slowLoadCost" type="number" step="0.1" min="0" value="${p.patience.slowLoadCost}"></label>
            <label>Progress gain<input name="progressGain" type="number" step="0.1" min="0" value="${p.patience.progressGain}"></label></div></details>
        </fieldset>
        <fieldset class="card"><legend>Voice</legend>
          <div class="f2"><label>Voice<select name="tts">${opt(meta.voices, p.voice.tts)}</select></label>
            <label>Speed <output name="o-speed">${p.voice.speed}×</output><input name="speed" type="range" min="0.8" max="1.25" step="0.01" value="${p.voice.speed}"></label></div>
          <label>Sample lines (one per line; the actor sees these as style, not script)<textarea name="samples" rows="5" placeholder="Hm. Where would that be?">${esc(samples)}</textarea></label>
          <div class="row"><button type="button" class="play-line" id="play-sample" data-line="">▶</button><span class="meta">Play the first sample line in this voice</span></div>
        </fieldset>
        <fieldset class="card"><legend>Studies</legend>
          ${meta.studies.map((s) => `<label class="inline"><input type="checkbox" name="study" value="${esc(s.id)}" ${studies.includes(s.id) ? "checked" : ""}> ${esc(s.name)} <span class="meta">(${s.tasks.length} tasks)</span></label>`).join("")}
        </fieldset>
        <div class="row savebar"><button class="primary" type="submit">${editing ? "Save changes" : "Create persona"}</button><a class="btn" href="${editing ? `#/persona/${esc(id)}` : "#/personas"}">Cancel</a><span id="save-status" class="meta" role="status"></span></div>
      </div>
      <aside class="pform-side"><div class="card sticky">
        <div class="card-h"><h2>Preview</h2><span class="meta" id="pv-where"></span></div>
        <label>Study<select id="pv-study">${opt(meta.studies.map((s) => [s.id, s.name]), STUDY || meta.studies[0]?.id)}</select></label>
        <div id="pv" class="pv"><p class="meta">The preview opens the study's start page with this device and vision. It updates as you change them.</p></div>
        <button type="button" id="pv-go">Refresh preview</button>
      </div></aside>
    </form>`;
  const f = document.getElementById("pf");
  const val = (n) => f.elements[n].value;
  const lines = (n) => val(n).split("\n").map((x) => x.trim()).filter(Boolean);
  const read = () => {
    const dev = val("device"), modality = f.querySelector("[name=modality]:checked").value;
    const viewport = dev === "custom" ? { width: Number(val("vw")), height: Number(val("vh")), deviceScaleFactor: 1, isMobile: false, hasTouch: false } : { ...DEVICES[dev].v };
    const transforms = [];
    if (modality !== "screen-reader") {
      if (val("cvd")) transforms.push({ type: "cvd", kind: val("cvd"), severity: Number(val("sev")) });
      if (Number(val("blur")) > 0) transforms.push({ type: "blur", sigma: Number(val("blur")) });
      if (Number(val("contrast")) < 1) transforms.push({ type: "contrast", amount: Number(val("contrast")) });
    }
    return {
      id: val("id").trim(), name: val("name").trim(), role: f.elements.control.checked ? "control" : "persona",
      summary: val("summary").trim(), context: val("context").trim(), temperament: val("temperament").trim(), modality, viewport,
      perception: { transforms }, input: { misclick: modality === "sighted" ? { sigmaPx: Number(val("sigma")), p: Number(val("slip")) } : { sigmaPx: 0, p: 0 } },
      knowledge: { web: val("web"), domain: val("domain"), conventions: lines("conventions"), unknown: lines("unknown") },
      patience: { budget: Number(val("budget")), wrongTurnCost: Number(val("wrongTurnCost")), deadClickCost: Number(val("deadClickCost")), slowLoadCost: Number(val("slowLoadCost")), progressGain: Number(val("progressGain")) },
      voice: { tts: val("tts"), speed: Number(val("speed")) },
    };
  };
  const sync = () => {
    const m = f.querySelector("[name=modality]:checked").value;
    f.querySelectorAll("[data-hide]").forEach((el) => { el.disabled = el.dataset.hide === m; el.hidden = el.dataset.hide === m; });
    f.querySelectorAll("[data-only]").forEach((el) => (el.hidden = el.dataset.only !== m));
    document.getElementById("custom-size").hidden = val("device") !== "custom";
    f.elements["o-sigma"].value = `${val("sigma")}px`; f.elements["o-slip"].value = `${Math.round(Number(val("slip")) * 100)}%`;
    f.elements["o-sev"].value = val("sev"); f.elements["o-blur"].value = `${val("blur")}px`; f.elements["o-contrast"].value = `×${val("contrast")}`;
    f.elements["o-budget"].value = val("budget"); f.elements["o-speed"].value = `${val("speed")}×`;
    f.elements.sev.disabled = !val("cvd");
    document.getElementById("play-sample").dataset.line = lines("samples")[0] || "Hm. Where would that be?";
  };
  let pvTimer = 0;
  const preview = () => { clearTimeout(pvTimer); pvTimer = setTimeout(() => showPreview({ ...read(), name: val("name") || "they" }, document.getElementById("pv"), document.getElementById("pv-where"), document.getElementById("pv-study").value), 600); };
  f.addEventListener("input", (e) => {
    sync();
    if (e.target.name === "name" && !editing && !f.elements.id.dataset.touched) f.elements.id.value = slug(val("name"));
    if (e.target.name === "id") f.elements.id.dataset.touched = "1";
    if (e.target.name === "device") {
      // Thumbs are less precise than a mouse: move the aim error to a sensible default when switching (still editable).
      const touch = DEVICES[val("device")]?.v.hasTouch, sig = Number(val("sigma"));
      if (touch && sig < 7) f.elements.sigma.value = 9; else if (!touch && sig > 6) f.elements.sigma.value = 4;
      sync();
    }
    if (["device", "vw", "vh", "cvd", "sev", "blur", "contrast", "modality"].includes(e.target.name)) preview();
  });
  document.getElementById("pv-study").onchange = preview;
  document.getElementById("pv-go").onclick = preview;
  wireVoiceButtons(f, () => ({ tts: val("tts"), speed: Number(val("speed")) }));
  sync(); preview();

  const fill = (np, smp) => {
    p = np;
    const set = (n, v) => { if (f.elements[n]) f.elements[n].value = v ?? ""; };
    set("name", np.name); set("id", np.id); set("summary", np.summary); set("context", np.context); set("temperament", np.temperament);
    f.elements.control.checked = np.role === "control";
    f.querySelectorAll("[name=modality]").forEach((r) => (r.checked = r.value === np.modality));
    set("device", deviceOf(np.viewport)); set("vw", np.viewport.width); set("vh", np.viewport.height);
    set("sigma", np.input?.misclick?.sigmaPx ?? 4); set("slip", np.input?.misclick?.p ?? 0.02);
    const t = (ty) => (np.perception?.transforms ?? []).find((x) => x.type === ty);
    set("cvd", t("cvd")?.kind ?? ""); set("sev", t("cvd")?.severity ?? 1); set("blur", t("blur")?.sigma ?? 0); set("contrast", t("contrast")?.amount ?? 1);
    set("web", np.knowledge?.web); set("domain", np.knowledge?.domain); set("conventions", (np.knowledge?.conventions ?? []).join("\n")); set("unknown", (np.knowledge?.unknown ?? []).join("\n"));
    for (const k of ["budget", "wrongTurnCost", "deadClickCost", "slowLoadCost", "progressGain"]) set(k, np.patience?.[k]);
    set("tts", np.voice?.tts); set("speed", np.voice?.speed ?? 1); if (smp != null) set("samples", smp);
    sync(); preview();
  };
  document.getElementById("draft")?.addEventListener("click", async () => {
    const ds = document.getElementById("draft-status"), b = document.getElementById("draft");
    b.disabled = true; ds.textContent = "Drafting… (about 20 seconds)";
    try {
      const r = await api("/api/persona-draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: document.getElementById("desc").value }) });
      fill({ ...NEW_PERSONA, ...r.persona, knowledge: { ...NEW_PERSONA.knowledge, ...r.persona.knowledge }, patience: { ...NEW_PERSONA.patience, ...r.persona.patience } }, r.voiceSamples);
      ds.textContent = r.valid ? "Drafted. Check every field before saving." : `Drafted with problems: ${r.errors.join("; ")}`;
    } catch (e) { ds.textContent = e.message; }
    finally { b.disabled = false; }
  });

  f.onsubmit = async (e) => {
    e.preventDefault();
    const st = document.getElementById("save-status");
    if (!f.reportValidity()) return;
    const body = { persona: read(), voiceSamples: val("samples"), studies: [...f.querySelectorAll("[name=study]:checked")].map((x) => x.value) };
    st.textContent = "Saving…";
    const r = await fetch(editing ? `/api/personas/${id}` : "/api/personas", { method: editing ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) { st.textContent = j.error; st.classList.add("err"); return; }
    location.hash = `#/persona/${j.persona.id}`;
  };
}

// ---------- Calibration ----------
async function calibrationPage(q) {
  const c = await api("/api/calibration");
  const f = (x) => (x == null || Number.isNaN(x) ? "–" : x.toFixed(2));
  const deckId = q.get("deck");
  app.innerHTML = `<h1>Calibration</h1>
  <p class="meta">Realism is measured, not asserted. The judge is trusted per criterion only once it agrees with human labels (n ≥ 10, κ ≥ 0.6, fail-recall ≥ 0.7). Rubric v${c.rubric.version}.</p>
  <h2>Judge vs human labels</h2>
  <table class="plain"><thead><tr><th>Criterion</th><th>n</th><th>Agreement</th><th>κ</th><th>Fail recall</th><th>Trusted</th></tr></thead><tbody>
  ${c.alignment.map((a) => `<tr><td>${esc(a.criterion)}</td><td>${a.n}</td><td>${a.n ? f(a.agree) : "–"}</td><td>${a.n ? f(a.kappa) : "–"}</td><td>${a.n ? f(a.failRecall) : "–"}</td><td>${a.trusted ? "✓ yes" : "✕ no"}</td></tr>`).join("")}
  </tbody></table>
  <h2>Turing check</h2>
  <p class="meta">Can a reviewer tell generated think-aloud from real? Build a deck with <code>usabilify turing --n 20</code> after adding real excerpts to <code>evals/turing/real.jsonl</code>.</p>
  <p>${c.decks.map((d) => `<a class="btn" href="#/calibration?deck=${d.id}">Take ${esc(d.id)} (${d.n})</a>`).join(" ") || "No decks yet."}</p>
  <p class="meta">${c.turing.guesses} guesses so far.</p>
  <div id="deck"></div>`;
  if (deckId) {
    const d = await api(`/api/turing/${deckId}`);
    let k = 0;
    const box = document.getElementById("deck");
    const show = () => {
      if (k >= d.items.length) { box.innerHTML = `<p>Deck finished. Thanks.</p>`; return; }
      box.innerHTML = `<div class="panel"><p class="meta">Item ${k + 1} of ${d.items.length}</p><div class="turing-item">${esc(d.items[k].text)}</div>
        <div class="row"><button data-g="real">A real person said this</button><button data-g="generated">This is generated</button></div><p id="reveal" aria-live="polite"></p></div>`;
      box.querySelectorAll("[data-g]").forEach((b) => (b.onclick = async () => {
        const r = await api("/api/turing-guess", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deck: d.id, item: d.items[k].id, guess: b.dataset.g }) });
        document.getElementById("reveal").textContent = `It was ${r.source}${r.persona ? ` (${r.persona})` : ""}.`;
        box.querySelectorAll("[data-g]").forEach((x) => (x.disabled = true));
        setTimeout(() => { k++; show(); }, 1200);
      }));
    };
    show();
  }
}

route();
