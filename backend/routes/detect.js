/**
 * POST /api/detect   Body: { goodsName }
 * Uses AI to auto-detect the goods category from the product name.
 * Returns { ok, category, confidence }. If confidence is low or the
 * category is "Other / unsure", the UI asks the user to pick manually.
 */
const express = require("express");
const router = express.Router();
const { detectCategory } = require("../ai");

router.post("/", async (req, res) => {
  const goodsName = String((req.body || {}).goodsName || "").trim();
  if (!goodsName) return res.status(400).json({ ok: false, error: "goodsName is required." });
  try {
    const result = await detectCategory(goodsName);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[detect] error:", err.message);
    res.status(500).json({ ok: false, error: "Detection failed." });
  }
});

module.exports = router;
