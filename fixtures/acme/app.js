// Acme Desk: a small admin app with planted usability problems (see studies/acme/known-issues.json).
const DEFAULT = {
  profile: { name: "Jordan Doe", email: "jordan@acme.test" },
  notifications: { weekly: true, mentions: true, billing: false, product: true },
  members: [
    { name: "Jordan Doe", email: "jordan@acme.test", role: "Owner", status: "Active" },
    { name: "Mei Chen", email: "mei@acme.test", role: "Admin", status: "Active" },
    { name: "Tom Becker", email: "tom@acme.test", role: "Member", status: "Active" },
  ],
};
const load = () => { try { return JSON.parse(localStorage.getItem("acme")) || structuredClone(DEFAULT); } catch { return structuredClone(DEFAULT); } };
let state = load();
const save = () => localStorage.setItem("acme", JSON.stringify(state));
save();
const $ = (s) => document.querySelector(s);
const main = $("#main");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function toast(msg) {
  // planted K5: the only confirmation of an invite vanishes after 1.5 s
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 1500);
}

const pages = {
  "/dashboard": () => `
    <h1>Good morning, ${esc(state.profile.name.split(" ")[0])}</h1>
    <div class="cards">
      <div class="card"><div class="muted">Open tickets</div><div class="big">42</div></div>
      <div class="card"><div class="muted">Resolved this week</div><div class="big">128</div></div>
      <div class="card"><div class="muted">Avg. first response</div><div class="big">1h 12m</div></div>
    </div>
    <h2>Recent activity</h2>
    <div class="list">
      <div class="row"><span>Mei Chen closed <b>#4182 Login loop on Safari</b></span><span class="muted">12m ago</span></div>
      <div class="row"><span>Tom Becker commented on <b>#4177 Export to CSV</b></span><span class="muted">1h ago</span></div>
      <div class="row"><span>Weekly report sent to ${esc(state.profile.email)}</span><span class="muted">Mon</span></div>
    </div>`,
  "/projects": () => `<h1>Projects</h1><div class="list">
      <div class="row"><span>Support Portal</span><span class="muted">14 open</span></div>
      <div class="row"><span>Mobile App</span><span class="muted">9 open</span></div>
      <div class="row"><span>Billing Migration</span><span class="muted">19 open</span></div></div>`,
  "/reports": () => `<h1>Reports</h1><div class="cards">
      <div class="card"><div class="muted">CSAT (30d)</div><div class="big">91%</div></div>
      <div class="card"><div class="muted">Backlog trend</div><div class="big">↓ 6%</div></div></div>
      <p class="muted">Weekly reports are emailed every Monday.</p>`,
  "/billing": () => `<h1>Billing</h1><div class="list"><div class="row"><span>Team plan · 3 seats</span><span class="muted">$45 / month</span></div></div>`,
  "/settings": () => settings("general"),
  "/settings/general": () => settings("general"),
  "/settings/notifications": () => settings("notifications"),
  "/settings/integrations": () => settings("integrations"),
  "/profile": () => `
    <h1>Profile</h1>
    <div class="list">
      <div class="row"><span><span class="muted">Display name</span><br><span id="name">${esc(state.profile.name)}</span><a href="#" class="edit" id="edit-name">edit</a></span></div>
      <div class="row"><span><span class="muted">Email</span><br>${esc(state.profile.email)}</span></div>
    </div>`,
  "/org/members": () => `
    <div class="head"><h1 style="margin:0">Organization members</h1><button class="plus" id="add" aria-label="Add member" title="Add member">+</button></div>
    <table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>
    ${state.members.map((m) => `<tr><td>${esc(m.name)}</td><td>${esc(m.email)}</td><td>${esc(m.role)}</td><td><span class="pill">${esc(m.status)}</span></td></tr>`).join("")}
    </tbody></table>`,
};

function settings(tab) {
  const tabs = ["general", "notifications", "integrations"].map((t) => `<a href="/settings/${t}" class="${t === tab ? "on" : ""}">${t[0].toUpperCase() + t.slice(1)}</a>`).join("");
  let body = "";
  if (tab === "general") body = `<div class="list">
      <div class="row"><span>Workspace name</span><span>Acme Support</span></div>
      <div class="row"><span>Time zone</span><span>Europe/Berlin</span></div>
      <div class="row"><span>Language</span><span>English</span></div></div>`;
  if (tab === "notifications") {
    const rows = [["weekly", "Weekly report email"], ["mentions", "Mentions"], ["billing", "Billing alerts"], ["product", "Product updates"]];
    body = `<div class="list">${rows.map(([k, label]) => `<div class="row"><span>${label}</span><button class="toggle" data-k="${k}" aria-label="${label}" aria-pressed="${state.notifications[k]}"></button></div>`).join("")}</div>`;
  }
  if (tab === "integrations") body = `<div class="list"><div class="row"><span>Slack</span><span class="muted">Not connected</span></div><div class="row"><span>GitHub</span><span class="muted">Connected</span></div></div>`;
  return `<h1>Settings</h1><nav class="tabs" aria-label="Settings sections">${tabs}</nav>${body}`;
}

function render() {
  let path = location.pathname;
  if (path === "/" || !pages[path]) path = "/dashboard";
  main.innerHTML = pages[path]();
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === path));
  $("#menu").hidden = true;
}

function go(href) { history.pushState(null, "", href); render(); }

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href^='/']");
  if (a) { e.preventDefault(); go(a.getAttribute("href")); return; }
  if (e.target.id === "avatar") { $("#menu").hidden = !$("#menu").hidden; return; }
  if (!e.target.closest("#menu")) $("#menu").hidden = true;
  const tg = e.target.closest(".toggle");
  if (tg) { const k = tg.dataset.k; state.notifications[k] = !state.notifications[k]; save(); tg.setAttribute("aria-pressed", state.notifications[k]); return; }
  if (e.target.id === "add") openInvite();
  if (e.target.id === "edit-name") { e.preventDefault(); editName(); }
  if (e.target.id === "signout") e.preventDefault();
});
window.addEventListener("popstate", render);

function openInvite() {
  const bg = document.createElement("div");
  bg.className = "modal-bg";
  bg.innerHTML = `<form class="modal" role="dialog" aria-modal="true" aria-labelledby="inv-h" novalidate>
    <h2 id="inv-h">Add member</h2>
    <div class="field"><label for="inv-name">Full name</label><input id="inv-name" autocomplete="off"></div>
    <div class="field"><label for="inv-email">Email</label><input id="inv-email" type="email" autocomplete="off"></div>
    <div class="field"><label for="inv-role">Role</label><select id="inv-role"><option value="">—</option><option>Member</option><option>Admin</option></select></div>
    <div class="actions"><button type="button" class="btn" id="inv-cancel">Cancel</button><button class="btn primary">Send invite</button></div></form>`;
  document.body.appendChild(bg);
  bg.querySelector("#inv-name").focus();
  bg.querySelector("#inv-cancel").onclick = () => bg.remove();
  bg.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const name = bg.querySelector("#inv-name").value.trim(), email = bg.querySelector("#inv-email").value.trim(), role = bg.querySelector("#inv-role");
    role.classList.toggle("invalid", !role.value);
    if (!name || !email || !role.value) return;
    state.members.push({ name, email, role: role.value, status: "Invited" });
    save(); bg.remove(); render(); toast(`Invitation sent to ${name}`);
  };
}

function editName() {
  const span = $("#name");
  span.outerHTML = `<input id="name-in" value="${esc(state.profile.name)}"> <button class="btn primary" id="name-save">Save</button>`;
  $("#edit-name").remove();
  $("#name-in").focus();
  $("#name-save").onclick = () => { state.profile.name = $("#name-in").value.trim() || state.profile.name; save(); render(); };
}

render();
