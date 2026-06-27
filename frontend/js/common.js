/* =================================================================
   Shared helpers + header behaviour + authentication
   ================================================================= */
const API = "/api";

/* ---- auth helpers ---------------------------------------------- */
/* sessionStorage = per-tab: admin in one tab + staff in another can be
   signed in at the same time in the same browser. */
const STORE = window.sessionStorage;
function getToken() { return STORE.getItem("dg_token") || ""; }
function getRole()  { return STORE.getItem("dg_role")  || ""; }
function getUser()  { return STORE.getItem("dg_user")  || ""; }
function getShift() { return STORE.getItem("dg_shift") || ""; }
function clearSession() { ["dg_token", "dg_role", "dg_user", "dg_shift"].forEach((k) => STORE.removeItem(k)); }
async function recordLogout() {
  try { await fetch(API + "/auth/logout", { method: "POST", headers: { Authorization: "Bearer " + getToken() } }); } catch {}
}
async function logout(msg) {
  await recordLogout();                       // stamp the logout time in the log
  if (msg) STORE.setItem("dg_login_msg", msg);
  clearSession();
  location.href = "login.html";
}

// redirect to login if not authenticated (skip on login page itself)
if (!location.pathname.endsWith("login.html") && !getToken()) { location.href = "login.html"; }

/* ---- utility --------------------------------------------------- */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg, isErr = false) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = isErr ? "show err" : "show";
  clearTimeout(t._timer); t._timer = setTimeout(() => (t.className = ""), 2800);
}
async function api(path, opts = {}) {
  // attach the auth token to every request
  opts.headers = { ...(opts.headers || {}), Authorization: "Bearer " + getToken() };
  const res = await fetch(API + path, opts);
  if (res.status === 401) {
    // capture the reason (e.g. shift ended), record logout, and bounce to login
    const j = await res.json().catch(() => ({}));
    await logout(j.error || "Your session has ended. Please sign in again.");
    return;
  }
  const json = await res.json().catch(() => ({ ok: false, errors: ["Bad server response."] }));
  if (!res.ok || json.ok === false) throw new Error((json.errors && json.errors.join(" ")) || json.error || "Request failed.");
  return json;
}
function niceTime(ts) {
  const d = new Date((ts || "").replace(" ", "T") + "Z");
  return isNaN(d) ? ts : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ---- search autocomplete --------------------------------------- */
let HIST_CACHE = null;
async function getHistory() {
  if (HIST_CACHE) return HIST_CACHE;
  try { const r = await api("/history?limit=200"); HIST_CACHE = r.items || []; } catch { HIST_CACHE = []; }
  return HIST_CACHE;
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function highlight(text, q) {
  const t = String(text || "");
  if (!q) return esc(t);
  const i = t.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(t);
  return esc(t.slice(0, i)) + "<b>" + esc(t.slice(i, i + q.length)) + "</b>" + esc(t.slice(i + q.length));
}
function wireAutocomplete(formId, inputId) {
  const form = document.getElementById(formId), input = document.getElementById(inputId);
  if (!form || !input) return;
  const box = document.createElement("div"); box.className = "search-suggest";
  form.appendChild(box);
  let list = [], active = -1, q = "";
  const hide = () => { box.classList.remove("show"); active = -1; };
  function paint() { box.querySelectorAll(".ss-item").forEach((el, i) => el.classList.toggle("active", i === active)); }
  function open(id) { location.href = "history.html?open=" + encodeURIComponent(id); }
  function render() {
    if (!q) { box.innerHTML = ""; hide(); return; }
    if (!list.length) { box.innerHTML = `<div class="search-empty">No matching records in history</div>`; box.classList.add("show"); return; }
    box.innerHTML = list.map((it) => `
      <a class="ss-item" data-id="${it.id}">
        <span class="ss-dot ${it.output.isDangerous ? "d" : "s"}"></span>
        <span class="ss-main">
          <span class="ss-name">${highlight(it.inputs.goodsName || "Untitled", q)}</span>
          <span class="ss-type">${esc(it.inputs.goodsType || "")}${(it.output.classification || {}).hazardClass ? " · " + esc(it.output.classification.hazardClass) : ""}</span>
        </span>
        <span class="ss-badge ${it.output.isDangerous ? "d" : "s"}">${it.output.isDangerous ? "Dangerous" : "Safe"}</span>
      </a>`).join("");
    box.classList.add("show");
    box.querySelectorAll(".ss-item").forEach((el) => el.addEventListener("mousedown", (e) => { e.preventDefault(); open(el.dataset.id); }));
  }
  const onType = debounce(async () => {
    q = (input.value || "").trim();
    if (!q) { hide(); return; }
    const all = await getHistory();
    const ql = q.toLowerCase();
    list = all.filter((it) => [it.inputs.goodsName, it.inputs.goodsType, it.inputs.origin, it.inputs.destination,
      (it.output.classification || {}).hazardClass, (it.output.classification || {}).unNumber].join(" ").toLowerCase().includes(ql)).slice(0, 7);
    active = -1; render();
  }, 110);
  input.addEventListener("input", onType);
  input.addEventListener("focus", onType);
  input.addEventListener("blur", () => setTimeout(hide, 160));
  input.addEventListener("keydown", (e) => {
    if (!box.classList.contains("show") || !list.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); active = (active + 1) % list.length; paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); active = (active - 1 + list.length) % list.length; paint(); }
    else if (e.key === "Enter" && active >= 0) { e.preventDefault(); open(list[active].id); }
    else if (e.key === "Escape") { hide(); }
  });
}

/* ---- goods categories ------------------------------------------ */
const CATEGORIES = [
  { key: "flammable", label: "Flammable", type: "Flammable liquid", items: [{ name: "Industrial enamel paint", type: "Flammable liquid" }, { name: "Acetone / solvent", type: "Flammable liquid" }, { name: "Ethanol", type: "Flammable liquid" }] },
  { key: "gas", label: "Compressed Gas", type: "Compressed gas", items: [{ name: "Compressed oxygen", type: "Compressed gas" }, { name: "LPG cylinders", type: "Compressed gas" }, { name: "Nitrogen cylinders", type: "Compressed gas" }] },
  { key: "corrosive", label: "Corrosive", type: "Corrosive", items: [{ name: "Industrial descaling acid", type: "Corrosive" }, { name: "Sodium hydroxide", type: "Corrosive" }, { name: "Battery acid", type: "Corrosive" }] },
  { key: "oxidiser", label: "Oxidiser", type: "Oxidiser", items: [{ name: "Hydrogen peroxide", type: "Oxidiser" }, { name: "Calcium hypochlorite", type: "Oxidiser" }, { name: "Ammonium nitrate", type: "Oxidiser" }] },
  { key: "battery", label: "Batteries", type: "Battery / electronics", items: [{ name: "Lithium-ion battery packs", type: "Battery / electronics" }, { name: "Power banks", type: "Battery / electronics" }, { name: "Car batteries", type: "Corrosive" }] },
  { key: "toxic", label: "Toxic", type: "Toxic / poison", items: [{ name: "Pesticides", type: "Toxic / poison" }, { name: "Industrial chemicals", type: "Toxic / poison" }] },
  { key: "general", label: "General Cargo", type: "General / non-hazardous", items: [{ name: "Office furniture", type: "General / non-hazardous" }, { name: "Textiles", type: "General / non-hazardous" }, { name: "Packaged food", type: "General / non-hazardous" }] },
];
const catLink = (name, type) => `index.html?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;

document.addEventListener("DOMContentLoaded", () => {
  /* ---- category bar ---- */
  const catbar = document.getElementById("catbar");
  if (catbar) {
    catbar.innerHTML = CATEGORIES.map((c) => `
      <div class="cat">
        <a href="index.html?type=${encodeURIComponent(c.type)}">${esc(c.label)} <i>⌄</i></a>
        <div class="dropdown">${c.items.map((it) => `<a href="${catLink(it.name, it.type)}">${esc(it.name)}<div class="dt">${esc(it.type)}</div></a>`).join("")}</div>
      </div>`).join("");
  }

  /* ---- mobile menu categories ---- */
  const mCats = document.getElementById("mCats");
  if (mCats) mCats.innerHTML = CATEGORIES.map((c) => `<a href="index.html?type=${encodeURIComponent(c.type)}">${esc(c.label)}</a>`).join("");

  /* ---- user info + logout in header ---- */
  const userEl = document.getElementById("headerUser");
  const logoutEl = document.getElementById("headerLogout");
  const mUserEl = document.getElementById("mHeaderUser");
  const mLogoutEl = document.getElementById("mHeaderLogout");
  const u = getUser(), r = getRole(), sh = getShift();
  const SHIFT_LABEL = { morning: "Morning", evening: "Evening", night: "Night" };
  if (u) {
    const roleText = r === "admin" ? "Admin" : (sh ? SHIFT_LABEL[sh] + " shift" : "Staff");
    const label = `${esc(u)} <span style="opacity:.6;font-size:.8em">· ${esc(roleText)}</span>`;
    if (userEl) userEl.innerHTML = label;
    if (mUserEl) mUserEl.innerHTML = label;
  }
  if (logoutEl) logoutEl.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  if (mLogoutEl) mLogoutEl.addEventListener("click", (e) => { e.preventDefault(); logout(); });

  /* ---- hide admin-only nav links (Analytics, Access Log) for staff ---- */
  if (getRole() !== "admin") {
    document.querySelectorAll(".admin-only").forEach((el) => (el.style.display = "none"));
  }

  /* ---- mobile menu toggle ---- */
  const burger = document.getElementById("hamburger");
  const menu = document.getElementById("mobileMenu");
  const ov = document.getElementById("mOverlay");
  function closeMenu() { menu && menu.classList.remove("show"); ov && ov.classList.remove("show"); burger && burger.classList.remove("open"); }
  if (burger && menu) {
    burger.addEventListener("click", () => { const open = menu.classList.toggle("show"); ov && ov.classList.toggle("show", open); burger.classList.toggle("open", open); });
    ov && ov.addEventListener("click", closeMenu);
    menu.querySelectorAll("a:not(#mHeaderLogout)").forEach((a) => a.addEventListener("click", closeMenu));
  }

  /* ---- header + mobile search ---- */
  function wireSearch(formId, inputId) {
    const f = document.getElementById(formId), inp = document.getElementById(inputId);
    if (!f) return;
    f.addEventListener("submit", (e) => { e.preventDefault(); const q = (inp.value || "").trim(); location.href = "history.html" + (q ? "?q=" + encodeURIComponent(q) : ""); });
  }
  wireSearch("hdrSearch", "hdrSearchInput");
  wireSearch("mSearchForm", "mSearchInput");
  wireAutocomplete("hdrSearch", "hdrSearchInput");
  wireAutocomplete("mSearchForm", "mSearchInput");
  wireAutocomplete("histSearchBox", "search");

  /* ---- provider pill ---- */
  api("/health").then((h) => {
    const p = (h.aiProvider || "?").toUpperCase();
    document.querySelectorAll(".provider-pill").forEach((el) => { el.textContent = "AI: " + p; el.classList.add(p === "MOCK" ? "mock" : "live"); });
  }).catch(() => {});

  /* ---- history count badge ---- */
  const badge = document.getElementById("histCount");
  if (badge) api("/analytics/quality").then((q) => { if (q.totalGenerations > 0) badge.textContent = q.totalGenerations > 99 ? "99+" : q.totalGenerations; }).catch(() => {});
});
