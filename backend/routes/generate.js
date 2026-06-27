/**
 * POST /api/generate
 * Receives form inputs, validates them, calls the AI engine,
 * saves the generation, and returns the parsed guidance.
 */
const express = require("express");
const router = express.Router();
const db = require("../db");
const { generateGuidance } = require("../ai");
const { PROMPT_VERSION } = require("../prompt");

function validate(body) {
  const errors = [];
  if (!body || typeof body !== "object") { errors.push("Request body is missing."); return errors; }
  if (!body.goodsName || !String(body.goodsName).trim()) errors.push("Goods / product name is required.");
  if (!body.goodsType || !String(body.goodsType).trim()) errors.push("Goods type is required.");
  if (String(body.goodsName || "").length > 200) errors.push("Goods name is too long (max 200 characters).");
  if (String(body.notes || "").length > 1000) errors.push("Notes are too long (max 1000 characters).");
  return errors;
}

router.post("/", async (req, res) => {
  const errors = validate(req.body);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  const inputs = {
    goodsName: req.body.goodsName ?? "",
    goodsType: req.body.goodsType ?? "",
    unNumber: req.body.unNumber ?? "",
    physicalState: req.body.physicalState ?? "",
    quantity: req.body.quantity ?? "",
    packaging: req.body.packaging ?? "",
    transportMode: req.body.transportMode ?? "Road",
    origin: req.body.origin ?? "",
    destination: req.body.destination ?? "",
    notes: req.body.notes ?? "",
  };

  try {
    const { data, provider, responseTimeMs } = await generateGuidance(inputs);
    const id = await db.insertGeneration({
      inputs, promptVersion: PROMPT_VERSION, aiResponse: data, provider, responseTimeMs,
    });
    return res.json({
      ok: true, id, inputs, output: data, provider, responseTimeMs,
      promptVersion: PROMPT_VERSION, createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[generate] error:", err.message);
    const m = err.message || "";
    let msg;
    if (/timed out|aborted/i.test(m)) {
      // Case 1: timeout (30s max)
      msg = "The AI took too long to respond (over the timeout). Please try again.";
    } else if (/\b429\b|rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(m)) {
      // Case 2: rate limit / quota exceeded
      msg = "AI rate limit reached. Wait a minute and try again, or switch to a Flash model / paid tier.";
    } else if (/empty ai response|no choices|no candidates/i.test(m)) {
      // Case 3: empty response from the model
      msg = "The AI returned an empty response. Please try regenerating.";
    } else if (/\b401\b|\b403\b|api key|not set|invalid.*key|unauthor/i.test(m)) {
      // Case 4: API key invalid / missing / not configured
      msg = "AI provider is not configured correctly. Check your API key in the .env file.";
    } else {
      msg = "Could not generate guidance right now. Please try again.";
    }
    return res.status(502).json({ ok: false, errors: [msg], detail: m });
  }
});

module.exports = router;
