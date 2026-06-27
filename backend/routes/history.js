/**
 * GET /api/history        -> list generations, newest first
 * GET /api/history/:id    -> full detail of one generation (with its feedback)
 */
const express = require("express");
const router = express.Router();
const db = require("../db");

function hydrate(row) {
  return {
    id: row.id,
    inputs: row.inputs,
    output: row.ai_response,
    promptVersion: row.prompt_version,
    provider: row.provider,
    responseTimeMs: row.response_time_ms,
    createdAt: row.created_at,
  };
}

router.get("/", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await db.listGenerations(limit);
    res.json({ ok: true, count: rows.length, items: rows.map(hydrate) });
  } catch (err) {
    console.error("[history] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not load history."] });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const row = await db.getGeneration(req.params.id);
    if (!row) return res.status(404).json({ ok: false, errors: ["Generation not found."] });
    const feedback = (await db.listFeedbackFor(req.params.id))
      .map((f) => ({ id: f.id, rating: f.rating, comment: f.comment, created_at: f.created_at }));
    res.json({ ok: true, item: { ...hydrate(row), feedback } });
  } catch (err) {
    console.error("[history] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not load record."] });
  }
});

module.exports = router;
