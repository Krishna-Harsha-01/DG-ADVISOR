/**
 * AI engine
 * ----------------------------------------------------------------
 * One function, generateGuidance(inputs), that:
 *   1. builds the prompt (prompt.js)
 *   2. calls the chosen provider (openai | gemini | mock)
 *   3. parses the JSON the model returns
 *   4. returns { data, provider, responseTimeMs }
 *
 * Provider is chosen by AI_PROVIDER in .env. "mock" needs no key,
 * so the whole app runs and demos out of the box.
 * ----------------------------------------------------------------
 */
const { SYSTEM_PROMPT, buildUserPrompt } = require("./prompt");

const PROVIDER = (process.env.AI_PROVIDER || "mock").toLowerCase();
const TIMEOUT_MS = (Number(process.env.AI_TIMEOUT_SECONDS) || 30) * 1000;

/** Strip stray markdown fences and parse JSON safely. */
function parseModelJson(text) {
  if (!text) throw new Error("Empty AI response");
  let clean = text.trim();
  // Remove ```json ... ``` fences if the model added them.
  clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // Grab the outermost {...} just in case there is surrounding prose.
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first !== -1 && last !== -1) clean = clean.slice(first, last + 1);
  return JSON.parse(clean);
}

/** fetch with an abort-based timeout. */
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---- OpenAI GPT-4o ----------------------------------------------
async function callOpenAI(userPrompt, systemPrompt = SYSTEM_PROMPT) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set in .env");
  const model = process.env.OPENAI_MODEL || "gpt-4o";

  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// ---- Google Gemini ----------------------------------------------
async function callGemini(userPrompt, systemPrompt = SYSTEM_PROMPT) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ---- OpenRouter (one key -> many models; OpenAI-compatible) ------
async function callOpenRouter(userPrompt, systemPrompt = SYSTEM_PROMPT) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in .env");
  const model = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";

  const res = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      // optional attribution headers (safe to keep for local use)
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "DG Compliance Advisor",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      // No response_format here: OpenRouter spans many models and some
      // (esp. free ones) reject it. The system prompt forces JSON and
      // parseModelJson() strips any stray fences, so this stays robust.
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content || "";
}

// ---- Mock provider (no API key, realistic demo output) ----------
function callMock(inputs) {
  const name = inputs.goodsName || "the goods";
  const type = (inputs.goodsType || "").toLowerCase();
  const un = inputs.unNumber && inputs.unNumber.trim() ? inputs.unNumber.trim() : "To be confirmed";

  // Very small rules engine so different inputs give different output.
  const profiles = {
    flammable: { cls: "Class 3 - Flammable liquid", pg: "II", placard: "Class 3 (red) flammable diamond" },
    corrosive: { cls: "Class 8 - Corrosive", pg: "II", placard: "Class 8 corrosive diamond" },
    gas: { cls: "Class 2 - Gases", pg: "N/A", placard: "Class 2 gas diamond" },
    battery: { cls: "Class 9 - Miscellaneous (lithium batteries)", pg: "N/A", placard: "Class 9 + lithium battery mark" },
    oxidiz: { cls: "Class 5.1 - Oxidiser", pg: "II", placard: "Class 5.1 oxidiser diamond" },
    toxic: { cls: "Class 6.1 - Toxic", pg: "II", placard: "Class 6.1 toxic diamond" },
  };
  let p = null;
  for (const key of Object.keys(profiles)) {
    if (type.includes(key) || (inputs.goodsName || "").toLowerCase().includes(key)) { p = profiles[key]; break; }
  }
  if (!p && (type.includes("flammable") || /paint|fuel|solvent|acetone/.test((inputs.goodsName||"").toLowerCase()))) p = profiles.flammable;

  // route feasibility (demo heuristic): road can't cross oceans/continents
  const overseas = /\b(usa|u\.s\.a|united states|america|uk|u\.k|england|britain|london|australia|canada|dubai|uae|singapore|malaysia|china|japan|korea|germany|france|europe|africa|brazil|russia|new york|los angeles)\b/i;
  const mode = (inputs.transportMode || "Road").toLowerCase();
  let tf;
  if (mode === "road" && (overseas.test(inputs.origin || "") || overseas.test(inputs.destination || ""))) {
    tf = { feasible: false, note: `This route (${inputs.origin || "origin"} → ${inputs.destination || "destination"}) is separated by sea/continents and CANNOT be moved by road. Use sea freight or air freight instead.` };
  } else if (mode === "road") {
    tf = { feasible: true, note: `Road transport is feasible for ${inputs.origin || "origin"} → ${inputs.destination || "destination"}. (Demo mode does a basic check; real AI assesses this in detail.)` };
  } else {
    tf = { feasible: true, note: `Selected mode: ${inputs.transportMode || "Road"}.` };
  }

  if (!p) {
    return {
      isDangerous: false,
      summary: `Based on the details provided, ${name} does not appear to be a regulated dangerous good. Confirm against the safety data sheet (SDS) before shipping.`,
      transportFeasibility: tf,
      classification: { unNumber: un, hazardClass: "Not classified / non-DG (verify with SDS)", packingGroup: "N/A" },
      regulations: ["No specific dangerous-goods classification identified from the inputs.", "Ship as general cargo unless the SDS indicates otherwise."],
      packaging: ["Standard secure packaging suitable for road transport.", "Ensure load is secured to prevent shifting."],
      labellingAndMarking: ["Standard shipping label with consignor/consignee details."],
      documentation: ["Standard consignment note / e-way bill as applicable."],
      handlingAndSegregation: ["No special segregation identified.", "Follow normal LTL/FTL handling procedures."],
      warnings: tf.feasible ? ["Always confirm classification against the manufacturer's Safety Data Sheet (SDS) before dispatch."] : [tf.note, "Always confirm classification against the manufacturer's Safety Data Sheet (SDS) before dispatch."],
      disclaimer: "This is advisory guidance generated by a demo (mock) engine — not a substitute for the official regulations.",
    };
  }

  return {
    isDangerous: true,
    summary: `${name} is a regulated dangerous good (${p.cls}). It must be packaged, labelled and documented per Indian road DG rules before transport from ${inputs.origin || "origin"} to ${inputs.destination || "destination"}.`,
    transportFeasibility: tf,
    classification: { unNumber: un, hazardClass: p.cls, packingGroup: p.pg },
    regulations: [
      "Central Motor Vehicles Rules (CMVR), Rules 129-137 governing transport of hazardous goods by road in India.",
      "UN Model Regulations / ADR class assignment used as the basis for classification.",
      "Driver must hold the required hazardous-goods endorsement and training certificate.",
    ],
    packaging: [
      `Use UN-certified packaging appropriate for ${p.cls}, Packing Group ${p.pg}.`,
      `Current packaging declared as "${inputs.packaging || "not provided"}" — verify it carries valid UN packaging marks.`,
      "Ensure closures are leak-proof and the package can withstand normal transport stresses.",
    ],
    labellingAndMarking: [
      `Affix the ${p.placard}.`,
      `Mark the proper shipping name and ${un} clearly on the package.`,
      "Vehicle must display the prescribed hazard placards/Class labels and emergency information panel.",
    ],
    documentation: [
      "Dangerous goods declaration / transport document listing UN number, proper shipping name, class and packing group.",
      "Safety Data Sheet (SDS) and TREM card (Transport Emergency card) carried in the vehicle.",
      "Valid e-way bill and consignment note.",
    ],
    handlingAndSegregation: [
      "Load so packages are upright and secured against movement.",
      "Keep segregated from incompatible cargo (e.g. flammables away from oxidisers; corrosives away from food-grade goods).",
      inputs.notes && /food/i.test(inputs.notes) ? "Note: do NOT co-load with food-grade cargo as flagged." : "Confirm no incompatible co-loaded cargo on the same vehicle.",
    ],
    warnings: [
      "Do not dispatch until UN number and hazard class are confirmed against the SDS.",
      "Driver must carry valid TREM card and know emergency procedures.",
    ],
    disclaimer: "This is advisory guidance generated by a demo (mock) engine — not a substitute for the official regulations or a certified DG advisor.",
  };
}

/**
 * Main entry point.
 * @param {object} inputs  validated form inputs
 * @returns {{data:object, provider:string, responseTimeMs:number}}
 */
async function generateGuidance(inputs) {
  const userPrompt = buildUserPrompt(inputs);
  const started = Date.now();
  let raw, data;

  if (PROVIDER === "openai") {
    raw = await callOpenAI(userPrompt);
    data = parseModelJson(raw);
  } else if (PROVIDER === "gemini") {
    raw = await callGemini(userPrompt);
    data = parseModelJson(raw);
  } else if (PROVIDER === "openrouter") {
    raw = await callOpenRouter(userPrompt);
    data = parseModelJson(raw);
  } else {
    // mock: simulate a little latency for a realistic demo
    await new Promise((r) => setTimeout(r, 600));
    data = callMock(inputs);
  }

  return { data, provider: PROVIDER, responseTimeMs: Date.now() - started };
}

// ---- Auto-detect the goods category from a product name ----------
const CATEGORIES = [
  "Flammable liquid", "Flammable solid", "Compressed gas", "Corrosive", "Oxidiser",
  "Toxic / poison", "Battery / electronics", "Explosive", "General / non-hazardous",
];
const DETECT_SYSTEM = `You identify dangerous-goods details from a product name for road freight.
1) Choose exactly ONE category from this list (copy it verbatim):
${CATEGORIES.map((c) => `- ${c}`).join("\n")}
   If you cannot tell confidently from the name alone, use "Other / unsure".
2) Give the substance's official UN number as "UNxxxx" (for example UN1263).
   - Provide a UN number ONLY if you are confident it is the correct, specific UN number for this exact substance.
   - Do NOT guess, approximate, or invent a UN number. Do not use a generic "n.o.s." number unless it clearly applies.
   - If the name is too generic, or you are not sure of the exact number, use an empty string "" so a person can enter it from the Safety Data Sheet.
   - If the product is non-hazardous / general cargo, use "N/A".
Respond with ONLY this JSON (no prose, no markdown):
{"category":"<one value from the list or 'Other / unsure'>","unNumber":"UNxxxx or N/A or empty","confidence":"high|medium|low"}`;

// mock keyword detection (offline)
function mockDetect(name) {
  const n = (name || "").toLowerCase();

  // 1) SPECIFIC substances with a well-defined, real UN number
  const specific = [
    [/enamel|varnish|lacquer|\bpaint\b/, "Flammable liquid", "UN1263"],
    [/acetone/, "Flammable liquid", "UN1090"],
    [/methanol|methyl alcohol/, "Flammable liquid", "UN1230"],
    [/ethanol|ethyl alcohol|methylated spirit/, "Flammable liquid", "UN1170"],
    [/toluene/, "Flammable liquid", "UN1294"],
    [/xylene/, "Flammable liquid", "UN1307"],
    [/petrol|gasoline/, "Flammable liquid", "UN1203"],
    [/diesel|gas\s?oil/, "Flammable liquid", "UN1202"],
    [/kerosene/, "Flammable liquid", "UN1223"],
    [/\bsulphur\b|\bsulfur\b/, "Flammable solid", "UN1350"],
    [/naphthalene/, "Flammable solid", "UN1334"],
    [/oxygen/, "Compressed gas", "UN1072"],
    [/\blpg\b/, "Compressed gas", "UN1075"],
    [/propane/, "Compressed gas", "UN1978"],
    [/nitrogen/, "Compressed gas", "UN1066"],
    [/argon/, "Compressed gas", "UN1006"],
    [/helium/, "Compressed gas", "UN1046"],
    [/acetylene/, "Compressed gas", "UN1001"],
    [/co2|carbon dioxide/, "Compressed gas", "UN1013"],
    [/sulphuric|sulfuric/, "Corrosive", "UN1830"],
    [/hydrochloric|muriatic/, "Corrosive", "UN1789"],
    [/nitric acid/, "Corrosive", "UN2031"],
    [/phosphoric acid/, "Corrosive", "UN1805"],
    [/sodium hydroxide|caustic soda/, "Corrosive", "UN1824"],
    [/battery acid/, "Corrosive", "UN2796"],
    [/sodium hypochlorite/, "Corrosive", "UN1791"],
    [/hydrogen peroxide/, "Oxidiser", "UN2014"],
    [/calcium hypochlorite/, "Oxidiser", "UN1748"],
    [/ammonium nitrate/, "Oxidiser", "UN1942"],
    [/potassium permanganate|permanganate/, "Oxidiser", "UN1490"],
    [/sodium cyanide/, "Toxic / poison", "UN1689"],
    [/mercury/, "Toxic / poison", "UN2809"],
    [/lithium.?ion|li-?ion|power\s?bank/, "Battery / electronics", "UN3480"],
    [/lithium metal/, "Battery / electronics", "UN3090"],
    [/lead.?acid/, "Battery / electronics", "UN2794"],
    [/dynamite/, "Explosive", "UN0081"],
    [/\btnt\b/, "Explosive", "UN0209"],
  ];
  for (const [re, cat, un] of specific) if (re.test(n)) return { category: cat, unNumber: un, confidence: "high" };

  // 2) GENERIC terms — we can tell the category, but NOT a specific real UN number,
  //    so leave the UN number EMPTY for the user to enter from the SDS.
  const generic = [
    [/acid|corrosive|caustic|alkali|ammonia|bleach|hydroxide/, "Corrosive"],
    [/solvent|thinner|flammable liquid|spirit|fuel/, "Flammable liquid"],
    [/match|firelighter|flammable solid/, "Flammable solid"],
    [/oxidis|oxidiz|oxidant|peroxide|nitrate|chlorate|hypochlorite/, "Oxidiser"],
    [/\bgas\b|cylinder|compressed|aerosol/, "Compressed gas"],
    [/toxic|poison|pesticide|insecticide|herbicide|cyanide|arsenic/, "Toxic / poison"],
    [/battery|batteries|\bcell\b|accumulator/, "Battery / electronics"],
    [/explosive|firework|ammunition|detonator|gunpowder/, "Explosive"],
  ];
  for (const [re, cat] of generic) if (re.test(n)) return { category: cat, unNumber: "", confidence: "medium" };

  // 3) clearly non-hazardous general cargo (food, produce, textiles, basic goods) -> no UN number
  if (/lemon|lime|orange|apple|banana|mango|grape|melon|berry|fruit|\bveg|onion|potato|tomato|carrot|cabbage|rice|wheat|grain|cereal|flour|sugar|\bsalt\b|spice|\btea\b|coffee|cocoa|biscuit|bread|snack|pulse|lentil|\bbean|cashew|almond|peanut|cotton|wool|silk|fabric|cloth|textile|garment|clothing|apparel|shirt|shoe|footwear|leather|chair|table|furnitur|\bwood\b|timber|plywood|plastic|ceramic|glassware|crockery|utensil|appliance|machine|spare part|\btool\b|hardware|\bsteel\b|\biron\b|\bmetal\b|alumini|cement|\btile\b|\bpipe\b|stationery|paper|\bbook|\btoy|sport|packaging|carton|grocery|food|rubber/.test(n))
    return { category: "General / non-hazardous", unNumber: "N/A", confidence: "high" };

  // 4) unknown -> let the user choose + enter manually
  return { category: "Other / unsure", unNumber: "", confidence: "low" };
}

async function detectCategory(goodsName) {
  const name = (goodsName || "").trim();
  if (!name) return { category: "Other / unsure", confidence: "low", provider: PROVIDER };
  const userPrompt = `Product name: ${name}`;
  try {
    let raw;
    if (PROVIDER === "openai") raw = await callOpenAI(userPrompt, DETECT_SYSTEM);
    else if (PROVIDER === "gemini") raw = await callGemini(userPrompt, DETECT_SYSTEM);
    else if (PROVIDER === "openrouter") raw = await callOpenRouter(userPrompt, DETECT_SYSTEM);
    else { await new Promise((r) => setTimeout(r, 250)); const m = mockDetect(name); return { ...m, provider: "mock" }; }

    const parsed = parseModelJson(raw);
    let category = String(parsed.category || "").trim();
    // accept only an exact list value; otherwise treat as unsure
    if (!CATEGORIES.includes(category)) category = "Other / unsure";
    // normalise the UN number: accept "UN1263", "1263", "N/A", or empty
    let unNumber = String(parsed.unNumber || "").trim().toUpperCase();
    if (unNumber && unNumber !== "N/A") {
      const m = unNumber.match(/UN?\s*([0-9]{3,4})/);
      if (m) unNumber = "UN" + m[1];
      else if (/^[0-9]{3,4}$/.test(unNumber)) unNumber = "UN" + unNumber;
      else if (unNumber === "NA" || unNumber === "NONE") unNumber = "N/A";
      else unNumber = "";
    }
    const confidence = ["high", "medium", "low"].includes(parsed.confidence) ? parsed.confidence : "medium";
    return { category, unNumber, confidence, provider: PROVIDER };
  } catch (err) {
    // if the AI call fails, fall back to the offline keyword guess
    const m = mockDetect(name);
    return { ...m, provider: PROVIDER, note: "fallback" };
  }
}

module.exports = { generateGuidance, detectCategory, PROVIDER };
