/**
 * POST /api/feedback   Body: { generation_id, rating (1-5), comment? }
 */
const express = require("express");
const router = express.Router();
const db = require("../db");

router.post("/", async (req, res) => {
  const { generation_id, rating, comment } = req.body || {};
  const errors = [];
  const genId = Number(generation_id);
  const r = Number(rating);
  if (!genId) errors.push("generation_id is required.");
  if (!Number.isInteger(r) || r < 1 || r > 5) errors.push("rating must be an integer from 1 to 5.");
  if (comment && String(comment).length > 1000) errors.push("comment is too long (max 1000 characters).");
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    if (!(await db.getGeneration(genId))) return res.status(404).json({ ok: false, errors: ["Generation not found."] });
    const id = await db.insertFeedback(genId, r, comment ? String(comment) : null);
    res.json({ ok: true, id });
  } catch (err) {
    console.error("[feedback] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not save feedback."] });
  }
});

module.exports = router;
