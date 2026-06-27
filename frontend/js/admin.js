/* =================================================================
   Admin analytics dashboard — animated bar + donut charts
   (esc/api/niceTime come from common.js; admin-only)
   Data is REAL: pulled from MySQL via /api/admin/analytics and
   auto-refreshed every 30s (re-renders only when the data changes).
   ================================================================= */
let currentPeriod = "all";
let lastSig = "";
const PERIOD_LABEL = { month: "This month", year: "This year", all: "All time" };
const PIE_COLORS = ["#ea580c", "#0ea5e9", "#16a34a", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6", "#6366f1", "#84cc16", "#64748b"];

async function load(period = currentPeriod, silent = false) {
  currentPeriod = period;
  let d;
  try {
    d = await api("/admin/analytics?period=" + period);
    if (!d) return;
  } catch (err) {
    if (!silent) { document.getElementById("sTotal").textContent = "—"; document.getElementById("goodsLegend").innerHTML = `<div class="trend-empty">${esc(err.message)}</div>`; }
    return;
  }

  // skip re-render (and re-animation) if nothing changed since last poll
  const sig = JSON.stringify({ p: period, s: d.summary, g: d.topGoodsTypes, dl: d.daily, q: d.qualityTrend, r: d.ratingDistribution });
  if (silent && sig === lastSig) return;
  lastSig = sig;

  // ---- stat cards ----
  document.getElementById("sTotal").textContent = d.summary.totalGenerations;
  document.getElementById("sRatings").textContent = d.summary.totalRatings;
  document.getElementById("sQuality").innerHTML = (d.summary.averageRating || 0) + "<small>/5</small>";
  document.getElementById("sResp").innerHTML = (d.summary.avgResponseMs || 0) + "<small>ms</small>";

  // ---- daily generations: animated vertical bars ----
  drawVBars("dailyBars", d.daily.map((x) => ({ label: x.day, value: x.count })));

  // ---- quality trend line ----
  if (!d.qualityTrend.length) {
    document.getElementById("trendChart").style.display = "none";
    document.getElementById("trendEmpty").style.display = "block";
  } else {
    document.getElementById("trendChart").style.display = "";
    document.getElementById("trendEmpty").style.display = "none";
    drawLine("trendChart", d.qualityTrend.map((x) => ({ label: x.day, value: x.avgRating })), "#16794c");
  }

  // ---- goods types: animated donut + legend ----
  const lbl = document.getElementById("goodsPeriodLabel");
  if (lbl) lbl.textContent = "· " + PERIOD_LABEL[period] + " (" + (d.goodsPeriodTotal || 0) + ")";
  drawDonut("goodsPie", "goodsLegend", d.topGoodsTypes.map((x) => ({ label: x.goodsType || "—", value: x.count })));

  // ---- rating distribution bars ----
  const dist = [1, 2, 3, 4, 5].map((r) => {
    const f = d.ratingDistribution.find((x) => x.rating === r);
    return { label: r + " ★", value: f ? f.count : 0 };
  });
  renderBars("ratingDist", dist, true);
}

// ---- period toggle ----
document.querySelectorAll("#periodToggle button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll("#periodToggle button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    lastSig = "";              // force re-render for the new period
    load(b.dataset.period);
  });
});

/* ---- animated vertical bar chart with axes + labels ----------- */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(s) { const p = String(s).split("-"); return (+p[2]) + " " + (MONTHS[+p[1] - 1] || ""); }   // 12 Jun
function fmtShort(s) { const p = String(s).split("-"); return (+p[2]) + "/" + (+p[1]); }                     // 12/6
function fmtFull(s) { const p = String(s).split("-"); return (+p[2]) + " " + (MONTHS[+p[1] - 1] || "") + " " + p[0]; }

function drawVBars(id, data) {
  const wrap = document.getElementById(id);
  if (!data.length) { wrap.innerHTML = '<div class="trend-empty">No data yet.</div>'; return; }
  const values = data.map((d) => d.value);
  const rawMax = Math.max(...values, 1);
  const step = Math.max(1, Math.ceil(rawMax / 4));      // round step so y-labels are whole numbers
  const niceMax = step * 4;
  const yticks = [4, 3, 2, 1, 0].map((i) => i * step);  // top → bottom
  const many = data.length > 7;
  const labelEvery = data.length > 10 ? 2 : 1;
  const fmt = many ? fmtShort : fmtDay;

  wrap.innerHTML = `
    <div class="vchart">
      <div class="vchart-yaxis">${yticks.map((t) => `<span>${t}</span>`).join("")}</div>
      <div class="vchart-plot">
        <div class="vchart-grid">${yticks.map(() => "<i></i>").join("")}</div>
        <div class="vbars">
          ${data.map((d) => `
            <div class="vbar" title="${esc(fmtFull(d.label))} — ${d.value} check${d.value === 1 ? "" : "s"}">
              <span class="vbar-num">${d.value}</span>
              <span class="vbar-fill" data-h="${(d.value / niceMax) * 100}"></span>
            </div>`).join("")}
        </div>
      </div>
    </div>
    <div class="vchart-xaxis">
      <span class="vchart-xpad"></span>
      <div class="xlabels">${data.map((d, i) => `<span>${i % labelEvery === 0 ? esc(fmt(d.label)) : ""}</span>`).join("")}</div>
    </div>
    <div class="axis-caption"><span>↑ Number of checks</span><span>Each bar = one day &nbsp;·&nbsp; Date →</span></div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.querySelectorAll(".vbar-fill").forEach((f) => { f.style.height = f.dataset.h + "%"; });
  }));
}

/* ---- animated donut chart (SVG) ------------------------------- */
function drawDonut(svgId, legendId, data) {
  const svg = document.getElementById(svgId);
  const legend = document.getElementById(legendId);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    svg.innerHTML = `<text x="60" y="62" text-anchor="middle" class="pie-center-lbl">No data</text>`;
    legend.innerHTML = '<div class="trend-empty">No data for this period yet.</div>';
    return;
  }
  const r = 45, cx = 60, cy = 60, C = 2 * Math.PI * r;
  let off = 0;
  const slices = data.map((d, i) => {
    const frac = d.value / total;
    const color = PIE_COLORS[i % PIE_COLORS.length];
    const c = `<circle class="pie-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="20"
      stroke-dasharray="0 ${C.toFixed(2)}" stroke-dashoffset="${(-off * C).toFixed(2)}"
      data-dash="${(frac * C).toFixed(2)}" data-gap="${((1 - frac) * C).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" style="transition-delay:${i * 90}ms"></circle>`;
    off += frac;
    return c;
  }).join("");
  svg.innerHTML = slices +
    `<text id="${svgId}-num" x="${cx}" y="${cy - 1}" text-anchor="middle" class="pie-center-num">${total}</text>` +
    `<text id="${svgId}-lbl" x="${cx}" y="${cy + 12}" text-anchor="middle" class="pie-center-lbl">checks</text>`;

  // animate slices drawing in
  requestAnimationFrame(() => requestAnimationFrame(() => {
    svg.querySelectorAll(".pie-slice").forEach((s) => { s.style.strokeDasharray = `${s.dataset.dash} ${s.dataset.gap}`; });
  }));

  // hover: thicken slice + show its label/percent in the centre
  const numEl = () => document.getElementById(svgId + "-num");
  const lblEl = () => document.getElementById(svgId + "-lbl");
  svg.querySelectorAll(".pie-slice").forEach((s, i) => {
    s.addEventListener("mouseenter", () => {
      s.style.strokeWidth = "24";
      const pct = Math.round((data[i].value / total) * 100);
      if (numEl()) numEl().textContent = pct + "%";
      if (lblEl()) lblEl().textContent = (data[i].label || "").slice(0, 14);
    });
    s.addEventListener("mouseleave", () => {
      s.style.strokeWidth = "20";
      if (numEl()) numEl().textContent = total;
      if (lblEl()) lblEl().textContent = "checks";
    });
  });

  // legend with colour swatch, count and percentage
  legend.innerHTML = data.map((d, i) => {
    const pct = Math.round((d.value / total) * 100);
    return `<div class="legend-row">
      <span class="legend-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
      <span class="legend-name" title="${esc(d.label)}">${esc(d.label)}</span>
      <span class="legend-val">${d.value} · ${pct}%</span>
    </div>`;
  }).join("");
}

/* ---- SVG line chart (quality trend) --------------------------- */
function drawLine(svgId, data, color) {
  const svg = document.getElementById(svgId);
  const W = 480, H = 180, pad = 28;
  svg.innerHTML = "";
  if (!data.length) return;
  const max = 5;
  const stepX = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
  const y = (v) => H - pad - (v / max) * (H - pad * 2);
  const x = (i) => pad + i * stepX;
  for (let g = 0; g <= 4; g++) {
    const gy = pad + (g * (H - pad * 2)) / 4;
    svg.appendChild(el("line", { x1: pad, y1: gy, x2: W - pad, y2: gy, stroke: "#eee", "stroke-width": 1 }));
  }
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  svg.appendChild(el("polyline", { points: `${pad},${H - pad} ${pts} ${x(data.length - 1)},${H - pad}`, fill: color, "fill-opacity": ".08", stroke: "none" }));
  svg.appendChild(el("polyline", { points: pts, fill: "none", stroke: color, "stroke-width": 2.5, "stroke-linejoin": "round" }));
  data.forEach((d, i) => {
    svg.appendChild(el("circle", { cx: x(i), cy: y(d.value), r: 3.5, fill: color }));
    if (data.length <= 8 || i % 2 === 0) {
      const t = el("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 9, fill: "#999" });
      t.textContent = (d.label || "").slice(5);
      svg.appendChild(t);
    }
  });
}
function el(tag, attrs) {
  const e = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

/* ---- horizontal bars (rating distribution) -------------------- */
function renderBars(id, data, quality = false) {
  const wrap = document.getElementById(id);
  if (!data.length || data.every((d) => !d.value)) { wrap.innerHTML = '<div class="trend-empty">No data yet.</div>'; return; }
  const max = Math.max(...data.map((d) => d.value), 1);
  wrap.innerHTML = data.map((d) => `
    <div class="bar-row">
      <span class="bl" title="${esc(d.label)}">${esc(d.label)}</span>
      <div class="bar-track"><div class="bar-fill ${quality ? "q" : ""}" style="width:0%" data-w="${(d.value / max) * 100}"></div></div>
      <span class="bv">${d.value}</span>
    </div>`).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    wrap.querySelectorAll(".bar-fill").forEach((f) => { f.style.width = f.dataset.w + "%"; });
  }));
}

load();
setInterval(() => load(currentPeriod, true), 30000);   // auto-refresh with real data

/* ---- preset management (admin) -------------------------------- */
async function loadPresets() {
  const wrap = document.getElementById("presetList");
  if (!wrap) return;
  try {
    const res = await api("/templates");
    if (!res) return;
    if (!res.items.length) { wrap.innerHTML = '<div class="trend-empty">No presets yet. Add one on the right.</div>'; return; }
    wrap.innerHTML = res.items.map((t) => `
      <div class="pa-item">
        <div class="pa-item-main">
          <div class="pa-item-name">${esc(t.name)}</div>
          <div class="pa-item-desc">${esc(t.description || "")}</div>
          <div class="pa-item-tags">${esc((t.inputs && t.inputs.goodsType) || "")}${t.inputs && t.inputs.unNumber ? " · " + esc(t.inputs.unNumber) : ""}</div>
        </div>
        <button class="pa-del" data-id="${t.id}" title="Delete preset">✕</button>
      </div>`).join("");
    wrap.querySelectorAll(".pa-del").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this preset?")) return;
      try { await api("/templates/" + b.dataset.id, { method: "DELETE" }); toast("Preset deleted."); loadPresets(); }
      catch (e) { toast(e.message, true); }
    }));
  } catch (e) { wrap.innerHTML = `<div class="trend-empty">${esc(e.message)}</div>`; }
}

const presetForm = document.getElementById("presetForm");
if (presetForm) {
  presetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("pName").value.trim();
    const goodsName = document.getElementById("pGoods").value.trim();
    if (!name || !goodsName) { toast("Preset name and goods name are required.", true); return; }
    const inputs = {
      goodsName,
      goodsType: document.getElementById("pType").value,
      unNumber: document.getElementById("pUn").value.trim(),
      quantity: document.getElementById("pQty").value.trim(),
      transportMode: "Road",
      origin: document.getElementById("pOrigin").value.trim(),
      destination: document.getElementById("pDest").value.trim(),
      notes: "",
    };
    const btn = document.getElementById("pAddBtn");
    btn.disabled = true; btn.textContent = "Adding…";
    try {
      await api("/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, description: document.getElementById("pDesc").value.trim(), inputs }) });
      toast("Preset added.");
      presetForm.reset();
      loadPresets();
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; btn.textContent = "Add preset"; }
  });
  loadPresets();
}
