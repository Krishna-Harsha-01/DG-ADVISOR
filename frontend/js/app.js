/* =================================================================
   Advisor page — form, generation, output, feedback
   (esc/toast/api/niceTime come from common.js)
   ================================================================= */
const form = document.getElementById("dgForm");
const outputBody = document.getElementById("outputBody");
const submitBtn = document.getElementById("submitBtn");

let lastInputs = null;
let currentGenId = null;

// ---- char counters ---------------------------------------------
document.querySelectorAll("[data-count]").forEach((el) => {
  const input = form.elements[el.getAttribute("data-count")];
  const update = () => (el.textContent = input.value.length);
  input.addEventListener("input", update);
  update();
});

// ---- presets ----------------------------------------------------
api("/templates").then((res) => {
  const wrap = document.getElementById("presets");
  if (!res.items.length) { wrap.innerHTML = '<span class="hint">No presets.</span>'; return; }
  wrap.innerHTML = "";
  res.items.forEach((t) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "preset"; b.textContent = t.name; b.title = t.description || "";
    b.onclick = () => { fillForm(t.inputs); toast("Preset loaded: " + t.name); };
    wrap.appendChild(b);
  });
}).catch(() => {});

function fillForm(values) {
  form.reset();                       // clear any leftovers from a previous check first
  if (window.__clearDetect) window.__clearDetect();
  document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  Object.entries(values).forEach(([k, v]) => { if (form.elements[k]) form.elements[k].value = v; });
  document.querySelectorAll("[data-count]").forEach((el) =>
    (el.textContent = (form.elements[el.getAttribute("data-count")].value || "").length));
}

// ---- validation -------------------------------------------------
function validate() {
  let ok = true;
  document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  ["goodsName", "goodsType", "unNumber"].forEach((name) => {
    if (!form.elements[name].value.trim()) {
      form.querySelector(`[data-field="${name}"]`).classList.add("invalid"); ok = false;
    }
  });
  return ok;
}
["goodsName", "goodsType", "unNumber"].forEach((name) => {
  form.elements[name].addEventListener("input", () =>
    form.querySelector(`[data-field="${name}"]`).classList.remove("invalid"));
});

// ---- submit -----------------------------------------------------
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!validate()) { toast("Please fill the required fields.", true); return; }
  generate(Object.fromEntries(new FormData(form).entries()));
});

// ---- clear form -------------------------------------------------
document.getElementById("clearBtn").addEventListener("click", () => {
  form.reset();
  document.querySelectorAll(".field.invalid").forEach((f) => f.classList.remove("invalid"));
  document.querySelectorAll("[data-count]").forEach((el) =>
    (el.textContent = (form.elements[el.getAttribute("data-count")].value || "").length));
  if (window.__clearDetect) window.__clearDetect();
  toast("Form cleared.");
});

async function generate(inputs) {
  lastInputs = inputs;
  submitBtn.disabled = true;
  showLoading();
  try {
    const res = await api("/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(inputs),
    });
    currentGenId = res.id;
    renderOutput(res);
  } catch (err) {
    showError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
}

const LOADERS = [
  "Reading shipment details…",
  "Identifying hazard classification…",
  "Checking packaging & labelling rules…",
  "Compiling compliance guidance…",
];
function showLoading() {
  let i = 0;
  outputBody.innerHTML = `<div class="loading"><div class="spinner"></div><p id="ld">${LOADERS[0]}</p></div>`;
  const ld = document.getElementById("ld");
  outputBody._timer = setInterval(() => { i = (i + 1) % LOADERS.length; if (ld) ld.textContent = LOADERS[i]; }, 1100);
}
function stopLoading() { clearInterval(outputBody._timer); }

function showError(msg) {
  stopLoading();
  outputBody.innerHTML = `
    <div class="verdict danger" style="margin:0">
      <div class="verdict-row">
        <span class="verdict-label">Request failed</span>
        <span class="verdict-value"><span class="vi"></span> Error</span>
      </div>
      <p class="verdict-summary">${esc(msg)}</p>
    </div>
    <div class="toolbar"><button class="btn btn-ghost" id="retryBtn">Try again</button></div>`;
  document.getElementById("retryBtn").onclick = () => lastInputs && generate(lastInputs);
}

// ---- render output ----------------------------------------------
function listSection(title, items, warn = false) {
  if (!items || !items.length) return "";
  return `<div class="section ${warn ? "warn" : ""}"><h3>${esc(title)}</h3>
    <ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
}

function transportHTML(tf, inputs) {
  if (!tf) return "";
  const mode = (inputs && inputs.transportMode) || "Road";
  if (tf.feasible === false) {
    return `<div class="verdict danger" style="margin-bottom:22px">
      <div class="verdict-row">
        <span class="verdict-label">Transport by ${esc(mode)}:</span>
        <span class="verdict-value"><span class="vi"></span> Not Possible</span>
      </div>
      <p class="verdict-summary">${esc(tf.note || "")}</p>
    </div>`;
  }
  return `<div class="section"><h3>Transport Mode Check</h3><ul><li>${esc(tf.note || (mode + " route is feasible."))}</li></ul></div>`;
}

function renderOutput(res) {
  stopLoading();
  const o = res.output || {};
  const cls = o.classification || {};
  const dangerous = !!o.isDangerous;
  const verdictText = dangerous ? "Dangerous" : "Non-Dangerous";

  outputBody.innerHTML = `
    <div class="fade-in">
      <div class="verdict ${dangerous ? "danger" : "safe"}">
        <div class="verdict-row">
          <span class="verdict-label">Type of Goods:</span>
          <span class="verdict-value"><span class="vi"></span> ${verdictText}</span>
        </div>
        ${o.summary ? `<p class="verdict-summary">${esc(o.summary)}</p>` : ""}
      </div>

      ${transportHTML(o.transportFeasibility, res.inputs)}

      <div class="chips">
        <div class="chip"><div class="k">UN Number</div><div class="v">${esc(cls.unNumber || "—")}</div></div>
        <div class="chip"><div class="k">Hazard Class</div><div class="v">${esc(cls.hazardClass || "—")}</div></div>
        <div class="chip"><div class="k">Packing Group</div><div class="v">${esc(cls.packingGroup || "—")}</div></div>
      </div>

      ${listSection("Applicable Regulations", o.regulations)}
      ${listSection("Packaging Requirements", o.packaging)}
      ${listSection("Labelling & Marking", o.labellingAndMarking)}
      ${listSection("Documentation", o.documentation)}
      ${listSection("Handling & Segregation", o.handlingAndSegregation)}
      ${listSection("Critical Warnings", o.warnings, true)}

      ${o.disclaimer ? `<p class="disclaimer">${esc(o.disclaimer)}</p>` : ""}

      <div class="toolbar">
        <button class="btn btn-ghost btn-sm" id="copyBtn">Copy</button>
        <button class="btn btn-ghost btn-sm" id="txtBtn">Download .txt</button>
        <button class="btn btn-ghost btn-sm" id="pdfBtn">Download PDF</button>
        <button class="btn btn-ghost btn-sm" id="shareBtn">Share</button>
        <button class="btn btn-primary btn-sm" id="regenBtn">Regenerate</button>
        <span class="meta">${esc((res.provider || "").toUpperCase())} · ${res.responseTimeMs}ms · prompt ${esc(res.promptVersion || "")}</span>
      </div>

      <div class="feedback-box" id="ratingBox">
        <div class="fb-label">Rate this guidance:</div>
        <div class="fb-row">
          <div class="thumbs">
            <button class="thumb up" id="thumbUp" title="Helpful">&#128077;</button>
            <button class="thumb down" id="thumbDown" title="Not helpful">&#128078;</button>
          </div>
          <span class="fb-divider"></span>
          <div class="stars" id="stars">${[1,2,3,4,5].map((n) => `<span class="star" data-v="${n}">★</span>`).join("")}</div>
        </div>
        <div class="fb-comment">
          <textarea id="fbComment" maxlength="1000" placeholder="Optional comment — what was good or what to improve?"></textarea>
          <button class="btn btn-ghost btn-sm" id="fbSubmit">Submit</button>
        </div>
      </div>
    </div>`;

  wireOutputActions(res);
}

function plainText(res) {
  const o = res.output || {}, c = o.classification || {};
  const sec = (t, arr) => (arr && arr.length ? `\n${t}\n` + arr.map((x) => "  - " + x).join("\n") + "\n" : "");
  return `AI DANGEROUS GOODS COMPLIANCE GUIDANCE
HK Shipping Private Limited
${"=".repeat(48)}

Goods: ${res.inputs.goodsName} (${res.inputs.goodsType})
Route: ${res.inputs.origin || "?"} -> ${res.inputs.destination || "?"} (${res.inputs.transportMode})

Type of Goods: ${o.isDangerous ? "DANGEROUS" : "NON-DANGEROUS"}
${o.summary || ""}
${o.transportFeasibility ? `\nTRANSPORT (${res.inputs.transportMode || "Road"}): ${o.transportFeasibility.feasible === false ? "NOT POSSIBLE" : "OK"} — ${o.transportFeasibility.note || ""}\n` : ""}
CLASSIFICATION
  UN Number:     ${c.unNumber || "-"}
  Hazard Class:  ${c.hazardClass || "-"}
  Packing Group: ${c.packingGroup || "-"}
${sec("APPLICABLE REGULATIONS", o.regulations)}${sec("PACKAGING", o.packaging)}${sec("LABELLING & MARKING", o.labellingAndMarking)}${sec("DOCUMENTATION", o.documentation)}${sec("HANDLING & SEGREGATION", o.handlingAndSegregation)}${sec("CRITICAL WARNINGS", o.warnings)}
${o.disclaimer || ""}

Generated ${res.createdAt || new Date().toISOString()} · ${res.provider} · prompt ${res.promptVersion || ""}`;
}

function wireOutputActions(res) {
  const text = plainText(res);
  document.getElementById("copyBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast("Copied to clipboard."); } catch { toast("Copy failed.", true); }
  };
  document.getElementById("shareBtn").onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast("Formatted guidance copied — ready to share."); } catch { toast("Copy failed.", true); }
  };
  document.getElementById("txtBtn").onclick = () => {
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `dg-guidance-${res.id || Date.now()}.txt`; a.click(); URL.revokeObjectURL(a.href);
    toast("Downloaded .txt");
  };
  document.getElementById("pdfBtn").onclick = () => downloadPdf(res);
  document.getElementById("regenBtn").onclick = () => lastInputs && generate(lastInputs);

  // feedback: thumbs + stars + comment
  let chosenRating = 0, feedbackSent = false;
  const stars = [...document.querySelectorAll("#stars .star")];
  const thumbUp = document.getElementById("thumbUp");
  const thumbDown = document.getElementById("thumbDown");
  const paintStars = (n, cls = "on") => stars.forEach((s, i) => s.classList.toggle(cls, i < n));
  function setRating(v) {
    chosenRating = v; paintStars(v);
    thumbUp.classList.toggle("on", v >= 4);
    thumbDown.classList.toggle("on", v > 0 && v <= 2);
  }
  stars.forEach((s) => {
    s.onmouseenter = () => paintStars(+s.dataset.v, "hover");
    s.onmouseleave = () => stars.forEach((x) => x.classList.remove("hover"));
    s.onclick = () => { setRating(+s.dataset.v); submitFeedback(); };
  });
  thumbUp.onclick = () => { setRating(5); submitFeedback(); };
  thumbDown.onclick = () => { setRating(1); submitFeedback(); };
  document.getElementById("fbSubmit").onclick = () => {
    if (!chosenRating) { toast("Pick a rating (stars or thumbs) first.", true); return; }
    submitFeedback();
  };
  async function submitFeedback() {
    if (feedbackSent || !chosenRating) return;
    const comment = (document.getElementById("fbComment").value || "").trim();
    try {
      await api("/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generation_id: currentGenId, rating: chosenRating, comment }),
      });
      feedbackSent = true;
      const box = document.getElementById("ratingBox");
      if (box && !box.querySelector(".thanks")) {
        const t = document.createElement("div");
        t.className = "thanks"; t.style.marginTop = "10px";
        t.textContent = `Thanks — rated ${chosenRating}/5${comment ? " with your comment" : ""}.`;
        box.appendChild(t);
      }
    } catch (err) { toast(err.message, true); }
  }
}

// ---- PDF via print window --------------------------------------
function downloadPdf(res) {
  const o = res.output || {}, c = o.classification || {};
  const sec = (t, arr) => (arr && arr.length ? `<h3>${esc(t)}</h3><ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>DG Guidance</title>
    <style>
      body{font-family:Arial,sans-serif;color:#0f172a;max-width:720px;margin:32px auto;padding:0 20px;line-height:1.5}
      .stripe{height:8px;background:repeating-linear-gradient(-45deg,#0f172a,#0f172a 14px,#f5b700 14px,#f5b700 28px);margin-bottom:18px}
      h1{font-size:18px} h2{font-size:13px;color:#888;margin-top:-6px}
      h3{font-size:13px;text-transform:uppercase;color:#ea580c;border-bottom:1px solid #eee;padding-bottom:4px;margin-top:18px}
      .v{display:inline-block;background:${o.isDangerous?"#ea580c":"#15803d"};color:#fff;padding:5px 12px;font-size:12px;font-weight:bold;border-radius:5px}
      .lbl{font-weight:bold;font-size:15px}
      table{border-collapse:collapse;margin:10px 0;font-size:13px} td{border:1px solid #ddd;padding:6px 10px}
      ul{margin:6px 0} li{margin:3px 0;font-size:13px}
      .disc{font-size:11px;color:#888;font-style:italic;margin-top:20px;border-top:1px solid #eee;padding-top:10px}
      .meta{font-size:10px;color:#aaa;margin-top:8px}
    </style></head><body onload="window.print()">
    <div class="stripe"></div>
    <h1>Dangerous Goods Compliance Guidance</h1>
    <h2>HK Shipping Private Limited</h2>
    <p><strong>Goods:</strong> ${esc(res.inputs.goodsName)} (${esc(res.inputs.goodsType)})<br>
       <strong>Route:</strong> ${esc(res.inputs.origin||"?")} &rarr; ${esc(res.inputs.destination||"?")} (${esc(res.inputs.transportMode)})</p>
    <p><span class="lbl">Type of Goods:</span> &nbsp;<span class="v">${o.isDangerous?"DANGEROUS":"NON-DANGEROUS"}</span></p>
    ${o.transportFeasibility ? `<p><strong>Transport by ${esc(res.inputs.transportMode||"Road")}:</strong> ${o.transportFeasibility.feasible===false?'<span style="color:#c2410c;font-weight:bold">NOT POSSIBLE</span>':"OK"} — ${esc(o.transportFeasibility.note||"")}</p>` : ""}
    <p>${esc(o.summary||"")}</p>
    <table><tr><td><strong>UN</strong></td><td>${esc(c.unNumber||"-")}</td></tr>
      <tr><td><strong>Hazard Class</strong></td><td>${esc(c.hazardClass||"-")}</td></tr>
      <tr><td><strong>Packing Group</strong></td><td>${esc(c.packingGroup||"-")}</td></tr></table>
    ${sec("Applicable Regulations",o.regulations)}${sec("Packaging",o.packaging)}
    ${sec("Labelling & Marking",o.labellingAndMarking)}${sec("Documentation",o.documentation)}
    ${sec("Handling & Segregation",o.handlingAndSegregation)}${sec("Critical Warnings",o.warnings)}
    <p class="disc">${esc(o.disclaimer||"")}</p>
    <p class="meta">Generated ${esc(res.createdAt||new Date().toISOString())} · ${esc(res.provider||"")} · prompt ${esc(res.promptVersion||"")}</p>
    </body></html>`;
  const w = window.open("", "_blank");
  if (!w) { toast("Allow pop-ups to download the PDF.", true); return; }
  w.document.write(html); w.document.close();
}

// ---- prefill from URL (?name=&type=) when arriving from category links ----
(function prefillFromURL() {
  const p = new URLSearchParams(location.search);
  const name = p.get("name"), type = p.get("type");
  if (!name && !type) return;
  if (name && form.elements.goodsName) form.elements.goodsName.value = name;
  if (type && form.elements.goodsType) {
    const sel = form.elements.goodsType;
    if ([...sel.options].some((o) => o.value === type)) sel.value = type;
  }
  document.querySelectorAll("[data-count]").forEach((el) =>
    (el.textContent = (form.elements[el.getAttribute("data-count")].value || "").length));
  const tool = document.getElementById("tool");
  if (tool) setTimeout(() => tool.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
})();

// ---- AI auto-detect of goods category from the product name ------
(function setupAutoDetect() {
  const nameEl = form.elements.goodsName;
  const typeEl = form.elements.goodsType;
  const unEl = form.elements.unNumber;
  const typeField = form.querySelector('[data-field="goodsType"]');
  const unField = form.querySelector('[data-field="unNumber"]');
  const statusEl = document.getElementById("detectStatus");
  const btn = document.getElementById("detectBtn");
  if (!nameEl || !typeEl || !unEl || !statusEl) return;
  let lastType = "";   // remember what we auto-filled, so we don't overwrite manual edits
  let lastUn = "";

  function setStatus(kind, html) { statusEl.className = "detect-status" + (kind ? " " + kind : ""); statusEl.innerHTML = html || ""; }
  window.__clearDetect = () => { lastType = ""; lastUn = ""; setStatus("", ""); };

  async function detect(force) {
    const name = (nameEl.value || "").trim();
    if (name.length < 3) { setStatus("", ""); return; }
    // don't overwrite a manual category choice unless the user clicks Auto-detect
    const typeIsManual = typeEl.value && typeEl.value !== lastType;
    const unIsManual = unEl.value && unEl.value !== lastUn;
    if (!force && typeIsManual && unIsManual) return;
    setStatus("loading", "Detecting category and UN number…");
    try {
      const res = await api("/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goodsName: name }) });
      if (!res) return;
      const knownCat = [...typeEl.options].some((o) => o.value === res.category) && res.category !== "Other / unsure" && res.confidence !== "low";

      // fill category (if allowed)
      if (knownCat && (force || !typeEl.value || typeEl.value === lastType)) {
        typeEl.value = res.category; lastType = res.category; typeField.classList.remove("invalid");
      }
      // fill UN number (only if allowed — never clobber a manual UN)
      const canSetUn = force || !unEl.value || unEl.value === lastUn;
      const un = res.unNumber || "";
      if (canSetUn && un) { unEl.value = un; lastUn = un; unField.classList.remove("invalid"); }

      // status message
      if (!knownCat) {
        setStatus("warn", `Couldn't identify this confidently — please choose the type and enter the UN number manually (from the SDS).`);
      } else if (un === "N/A") {
        setStatus("ok", `Auto-detected: <b>${esc(res.category)}</b> · no UN number needed (<b>N/A</b> — not a dangerous good).`);
      } else if (un) {
        setStatus("ok", `Auto-detected: <b>${esc(res.category)}</b> · <b>${esc(un)}</b> — please verify against the SDS before dispatch.`);
      } else {
        setStatus("warn", `Detected <b>${esc(res.category)}</b>, but couldn't determine the UN number — please enter it from the SDS.`);
      }
    } catch (e) { setStatus("", ""); }
  }

  nameEl.addEventListener("blur", () => detect(false));
  if (btn) btn.addEventListener("click", () => detect(true));
  const unBtn = document.getElementById("detectUnBtn");
  if (unBtn) unBtn.addEventListener("click", () => detect(true));   // same detection, fills both fields
  // manual edits clear the auto-detected note
  typeEl.addEventListener("change", () => {
    if (typeEl.value !== lastType) setStatus("", "");
    // a non-hazardous good has no UN number — offer N/A automatically
    if (typeEl.value === "General / non-hazardous" && !unEl.value) { unEl.value = "N/A"; lastUn = "N/A"; unField.classList.remove("invalid"); }
  });
  // if a product name was pre-filled (e.g. from a category link) and UN is empty, detect once
  if (nameEl.value.trim().length >= 3 && !unEl.value.trim()) detect(false);
})();
