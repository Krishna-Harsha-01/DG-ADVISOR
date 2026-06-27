/* =================================================================
   Admin "Staff Access" page — roster + login activity log
   (esc/api/niceTime come from common.js; admin-only)
   ================================================================= */
const SHIFT_BADGE = { morning: "Morning", evening: "Evening", night: "Night", admin: "Admin" };

async function loadStaff() {
  const rosterEl = document.getElementById("roster");
  const nowEl = document.getElementById("currentShift");
  try {
    const res = await api("/admin/staff");
    if (!res) return;
    if (nowEl && res.currentShift) nowEl.textContent = SHIFT_BADGE[res.currentShift] + " shift";
    rosterEl.innerHTML = res.staff.map((s) => `
      <div class="staff-card ${s.onShift ? "on" : ""}">
        <div class="sc-top">
          <div>
            <div class="sc-name">${esc(s.name)}</div>
            <div class="sc-shift">${esc(s.shiftLabel)} shift · ${esc(s.window)}</div>
          </div>
          <span class="sc-status ${s.onShift ? "on" : "off"}">${s.onShift ? "On shift now" : "Off shift"}</span>
        </div>
        <div class="sc-code"><span>Access code</span><code>${esc(s.code)}</code></div>
      </div>`).join("");
  } catch (err) {
    rosterEl.innerHTML = `<div class="empty-state"><h3>Couldn't load staff</h3><p>${esc(err.message)}</p></div>`;
  }
}

function durationText(inAt, outAt) {
  if (!inAt || !outAt) return "";
  const a = new Date(String(inAt).replace(" ", "T") + "Z");
  const b = new Date(String(outAt).replace(" ", "T") + "Z");
  let s = Math.max(0, Math.round((b - a) / 1000));
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

async function loadLogins() {
  const logEl = document.getElementById("loginLog");
  try {
    const res = await api("/admin/logins");
    if (!res) return;
    if (!res.logins.length) {
      logEl.innerHTML = `<div class="empty-state" style="padding:40px"><h3>No logins yet</h3><p>Login activity will appear here.</p></div>`;
      return;
    }
    logEl.innerHTML = `
      <table class="log-table">
        <thead><tr><th>Name</th><th>Code</th><th>Shift</th><th>Role</th><th>Login time</th><th>Logout time</th><th>Duration</th></tr></thead>
        <tbody>
          ${res.logins.map((l) => `
            <tr>
              <td data-l="Name">${esc(l.staff_name)}</td>
              <td data-l="Code"><code>${esc(l.staff_code)}</code></td>
              <td data-l="Shift"><span class="shift-tag ${esc(l.shift)}">${esc(SHIFT_BADGE[l.shift] || l.shift)}</span></td>
              <td data-l="Role">${esc(l.role)}</td>
              <td data-l="Login time">${esc(niceTime(l.logged_in_at))}</td>
              <td data-l="Logout time">${l.logged_out_at ? esc(niceTime(l.logged_out_at)) : '<span class="active-badge">Active</span>'}</td>
              <td data-l="Duration">${l.logged_out_at ? esc(durationText(l.logged_in_at, l.logged_out_at)) : "—"}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  } catch (err) {
    logEl.innerHTML = `<div class="empty-state"><h3>Couldn't load login log</h3><p>${esc(err.message)}</p></div>`;
  }
}

document.getElementById("refreshStaff").addEventListener("click", () => { loadStaff(); loadLogins(); });
loadStaff();
loadLogins();
