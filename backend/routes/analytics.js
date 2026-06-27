/**
 * GET /api/analytics/quality   -> quick quality summary
 * GET /api/admin/analytics     -> full dashboard data
 */
const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/quality", async (req, res) => {
  try { res.json({ ok: true, ...(await db.quickQuality()) }); }
  catch (err) { console.error("[analytics] error:", err.message); res.status(500).json({ ok: false, errors: ["Could not load analytics."] }); }
});

router.get("/analytics", async (req, res) => {
  try {
    const period = ["month", "year", "all"].includes(req.query.period) ? req.query.period : "all";
    res.json({ ok: true, ...(await db.adminAnalytics(period)) });
  }
  catch (err) { console.error("[analytics] error:", err.message); res.status(500).json({ ok: false, errors: ["Could not load analytics."] }); }
});

module.exports = router;
