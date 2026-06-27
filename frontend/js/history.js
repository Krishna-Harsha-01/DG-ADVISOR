/* =================================================================
   History page — list, search/filter, slide-in detail drawer
   (esc/toast/api/niceTime come from common.js)
   ================================================================= */
const histArea = document.getElementById("histArea");
const searchEl = document.getElementById("search");
const filterEl = document.getElementById("filter");
let ALL = [];

async function load() {
  try {
    const res = await api("/history?limit=200");
    ALL = res.items || [];
    render();
  } catch (err) {
    histArea.innerHTML = `<div class="empty-state"><div class="ph-mark"></div><h3>Couldn't load history</h3><p>${esc(err.message)}</p></div>`;
  }
}

function render() {
  const q = (searchEl.value || "").toLowerCase().trim();
  const f = filterEl.value;
  let items = ALL.filter((it) => {
    if (f === "dangerous" && !it.output.isDangerous) return false;
    if (f === "safe" && it.output.isDangerous) return false;
    if (!q) return true;
    const hay = [
      it.inputs.goodsName, it.inputs.goodsType, it.inputs.origin, it.inputs.destination,
      (it.output.classification || {}).hazardClass, (it.output.classification || {}).unNumber,
    ].join(" ").toLowerCase();
    return hay.includes(q);
  });

  if (!ALL.length) {
    histArea.innerHTML = `<div class="empty-state"><div class="ph-mark"></div>
      <h3>No generations yet</h3><p>Run your first compliance check on the Advisor page — it'll show up here.</p>
      <p style="margin-top:14px"><a class="btn btn-primary btn-sm" href="index.html">Go to Advisor</a></p></div>`;
    return;
  }
  if (!items.length) {
    histArea.innerHTML = `<div class="empty-state"><div class="ph-mark"></div><h3>No matches</h3><p>Try a different search or filter.</p></div>`;
    return;
  }

  histArea.innerHTML = `<div class="hist-grid">${items.map(card).join("")}</div>`;
  histArea.querySelectorAll(".hist-card").forEach((el) => (el.onclick = () => openDetail(el.dataset.id)));
}

function card(it) {
  const d = it.output.isDangerous;
  const cls = (it.output.classification || {}).hazardClass || "—";
  const route = [it.inputs.origin, it.inputs.destination].filter(Boolean).join(" → ") || it.inputs.transportMode || "—";
  return `<div class="hist-card ${d ? "" : "safe"}" data-id="${it.id}">
    <div class="strip"></div>
    <div class="hc-top">
      <div>
        <div class="hc-name">${esc(it.inputs.goodsName || "Untitled")}</div>
        <div class="hc-type">${esc(it.inputs.goodsType || "")}</div>
      </div>
      <span class="badge ${d ? "d" : "s"}">${d ? "Dangerous" : "Non-Dangerous"}</span>
    </div>
    <div class="hc-cls"><b>Type of Goods:</b> ${d ? "Dangerous" : "Non-Dangerous"} &nbsp;·&nbsp; ${esc(cls)}</div>
    <div class="hc-foot">
      <span class="hc-route">${esc(route)}</span>
      <span>${esc(niceTime(it.createdAt))}</span>
    </div>
  </div>`;
}

// ---- detail drawer ----------------------------------------------
const overlay = document.getElementById("overlay");
const modal = document.getElementById("modal");
function closeModal() { modal.classList.remove("show"); overlay.classList.remove("show"); }
overlay.onclick = closeModal;
document.getElementById("modalClose").onclick = closeModal;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function sectionHTML(title, items, warn) {
  if (!items || !items.length) return "";
  return `<div class="section ${warn ? "warn" : ""}"><h3>${esc(title)}</h3>
    <ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}

async function openDetail(id) {
  const body = document.getElementById("modalBody");
  body.innerHTML = `<div class="loading"><div class="spinner"></div><p>Loading record…</p></div>`;
  modal.classList.add("show"); overlay.classList.add("show");
  try {
    const res = await api("/history/" + id);
    const it = res.item;
    const o = it.output || {}, c = o.classification || {}, d = !!o.isDangerous;
    document.getElementById("modalTitle").textContent = it.inputs.goodsName || ("Record #" + it.id);

    const inputRows = [
      ["Goods type", it.inputs.goodsType], ["UN number", it.inputs.unNumber],
      ["Physical state", it.inputs.physicalState], ["Quantity", it.inputs.quantity],
      ["Packaging", it.inputs.packaging], ["Transport", it.inputs.transportMode],
      ["Origin", it.inputs.origin], ["Destination", it.inputs.destination], ["Notes", it.inputs.notes],
    ].filter(([, v]) => v && String(v).trim());

    const fb = (it.feedback || []).map((f) =>
      `<li>★ ${f.rating}/5${f.comment ? " — " + esc(f.comment) : ""} <span style="color:var(--muted-2)">(${esc(niceTime(f.created_at))})</span></li>`
    ).join("");

    const tf = o.transportFeasibility;
    const mode = it.inputs.transportMode || "Road";
    const tfHTML = !tf ? "" : (tf.feasible === false
      ? `<div class="verdict danger" style="margin-bottom:22px"><div class="verdict-row"><span class="verdict-label">Transport by ${esc(mode)}:</span><span class="verdict-value"><span class="vi"></span> Not Possible</span></div><p class="verdict-summary">${esc(tf.note || "")}</p></div>`
      : `<div class="section"><h3>Transport Mode Check</h3><ul><li>${esc(tf.note || (mode + " route is feasible."))}</li></ul></div>`);

    body.innerHTML = `
      <div class="verdict ${d ? "danger" : "safe"}">
        <div class="verdict-row">
          <span class="verdict-label">Type of Goods:</span>
          <span class="verdict-value"><span class="vi"></span> ${d ? "Dangerous" : "Non-Dangerous"}</span>
        </div>
        ${o.summary ? `<p class="verdict-summary">${esc(o.summary)}</p>` : ""}
      </div>

      ${tfHTML}

      <div class="chips">
        <div class="chip"><div class="k">UN Number</div><div class="v">${esc(c.unNumber || "—")}</div></div>
        <div class="chip"><div class="k">Hazard Class</div><div class="v">${esc(c.hazardClass || "—")}</div></div>
        <div class="chip"><div class="k">Packing Group</div><div class="v">${esc(c.packingGroup || "—")}</div></div>
      </div>

      <div class="section"><h3>Shipment Inputs</h3>
        <ul>${inputRows.map(([k, v]) => `<li><b>${esc(k)}:</b> ${esc(v)}</li>`).join("")}</ul>
      </div>

      ${sectionHTML("Applicable Regulations", o.regulations)}
      ${sectionHTML("Packaging Requirements", o.packaging)}
      ${sectionHTML("Labelling & Marking", o.labellingAndMarking)}
      ${sectionHTML("Documentation", o.documentation)}
      ${sectionHTML("Handling & Segregation", o.handlingAndSegregation)}
      ${sectionHTML("Critical Warnings", o.warnings, true)}
      ${fb ? `<div class="section"><h3>Feedback</h3><ul>${fb}</ul></div>` : ""}
      ${o.disclaimer ? `<p class="disclaimer">${esc(o.disclaimer)}</p>` : ""}

      <div class="toolbar">
        <a class="btn btn-ghost btn-sm" href="index.html">Run a new check</a>
        <span class="meta">${esc((it.provider || "").toUpperCase())} · ${it.responseTimeMs}ms · prompt ${esc(it.promptVersion || "")} · ${esc(niceTime(it.createdAt))}</span>
      </div>`;
  } catch (err) {
    body.innerHTML = `<div class="empty-state"><h3>Couldn't load record</h3><p>${esc(err.message)}</p></div>`;
  }
}

searchEl.addEventListener("input", render);
filterEl.addEventListener("change", render);
document.getElementById("refreshBtn").onclick = load;
// prefill search box from ?q= (header search) and open a record from ?open=
(function () {
  const params = new URLSearchParams(location.search);
  const q = params.get("q");
  if (q && searchEl) searchEl.value = q;
  const openId = params.get("open");
  if (openId) setTimeout(() => openDetail(openId), 150);
})();
load();
