/**
 * GET  /api/templates   -> list one-click preset scenarios
 * POST /api/templates   -> add a new preset
 */
const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/", async (req, res) => {
  try {
    const rows = await db.listTemplates();
    res.json({ ok: true, items: rows.map((r) => ({ id: r.id, name: r.name, description: r.description, inputs: r.inputs, createdAt: r.created_at })) });
  } catch (err) {
    console.error("[templates] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not load templates."] });
  }
});

router.post("/", async (req, res) => {
  if (req.user && req.user.role !== "admin") return res.status(403).json({ ok: false, errors: ["Only an admin can add presets."] });
  const { name, description, inputs } = req.body || {};
  const errors = [];
  if (!name || !String(name).trim()) errors.push("name is required.");
  if (!inputs || typeof inputs !== "object") errors.push("inputs object is required.");
  if (errors.length) return res.status(400).json({ ok: false, errors });
  try {
    const id = await db.addTemplate(String(name), description ? String(description) : null, inputs);
    res.json({ ok: true, id });
  } catch (err) {
    console.error("[templates] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not add template."] });
  }
});

router.delete("/:id", async (req, res) => {
  if (req.user && req.user.role !== "admin") return res.status(403).json({ ok: false, errors: ["Only an admin can delete presets."] });
  try {
    const removed = await db.deleteTemplate(req.params.id);
    if (!removed) return res.status(404).json({ ok: false, errors: ["Preset not found."] });
    res.json({ ok: true });
  } catch (err) {
    console.error("[templates] error:", err.message);
    res.status(500).json({ ok: false, errors: ["Could not delete template."] });
  }
});

module.exports = router;
