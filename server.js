/**
 * AI Dangerous Goods Handling Compliance Advisor
 * Server entry point
 * ----------------------------------------------------------------
 * Run:  npm install  then  npm start
 * Open: http://localhost:3000
 * ----------------------------------------------------------------
 */
require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const { PROVIDER } = require("./backend/ai");
const db = require("./backend/db");
const { requireAuth, requireAdmin, shiftWindow, shiftLabel, isWithinShift, currentShift } = require("./backend/auth");
const authRoute = require("./backend/routes/auth");
const generateRoute = require("./backend/routes/generate");
const detectRoute = require("./backend/routes/detect");
const historyRoute = require("./backend/routes/history");
const feedbackRoute = require("./backend/routes/feedback");
const analyticsRoute = require("./backend/routes/analytics");
const templatesRoute = require("./backend/routes/templates");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Middleware -------------------------------------------------
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// ---- Auth routes (public — no token needed) --------------------
app.use("/api/auth", authRoute);

// ---- Public health (no auth, so the UI can check server status) -
app.get("/api/health", (req, res) =>
  res.json({ ok: true, status: "up", aiProvider: PROVIDER })
);

// ---- Protected API routes (staff + admin) ----------------------
app.use("/api/generate",  requireAuth, generateRoute);
app.use("/api/detect",    requireAuth, detectRoute);
app.use("/api/history",   requireAuth, historyRoute);
app.use("/api/feedback",  requireAuth, feedbackRoute);
app.use("/api/templates", requireAuth, templatesRoute);

// ---- Admin-only: staff roster + login activity -----------------
app.get("/api/admin/staff", requireAdmin, async (req, res) => {
  try {
    const staff = await db.listStaff();
    res.json({
      ok: true,
      currentShift: currentShift(),
      staff: staff.map((s) => ({
        code: s.code, name: s.name, shift: s.shift,
        shiftLabel: shiftLabel(s.shift), window: shiftWindow(s.shift), onShift: isWithinShift(s.shift),
      })),
    });
  } catch (e) { res.status(500).json({ ok: false, error: "Could not load staff." }); }
});
app.get("/api/admin/logins", requireAdmin, async (req, res) => {
  try { res.json({ ok: true, logins: await db.listLogins(200) }); }
  catch (e) { res.status(500).json({ ok: false, error: "Could not load login log." }); }
});

// ---- Analytics: admin only -------------------------------------
app.use("/api/analytics", requireAdmin, analyticsRoute);
app.use("/api/admin",     requireAdmin, analyticsRoute);   // /api/admin/analytics

// ---- Static frontend --------------------------------------------
app.use(express.static(path.join(__dirname, "frontend")));

// ---- 404 for unknown API routes ---------------------------------
app.use("/api", (req, res) =>
  res.status(404).json({ ok: false, errors: ["Unknown API endpoint."] })
);

// ---- Start (connect to MySQL first, then listen) ----------------
(async () => {
  try {
    await db.init();
  } catch (err) {
    console.error("\n==============================================");
    console.error("  ✗ Could not connect to MySQL.");
    console.error("    " + (err.code ? err.code + " — " : "") + err.message);
    console.error("  Check that:");
    console.error("    • your MySQL server is running");
    console.error("    • DB_HOST / DB_PORT / DB_USER / DB_PASSWORD in .env are correct");
    console.error("  The app cannot start without the database. Exiting.");
    console.error("==============================================\n");
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log("==============================================");
    console.log("  AI Dangerous Goods Compliance Advisor");
    console.log(`  Server:    http://localhost:${PORT}`);
    console.log(`  Admin:     http://localhost:${PORT}/admin.html`);
    console.log(`  Database:  MySQL (${process.env.DB_NAME || "dg_advisor"})`);
    console.log(`  AI mode:   ${PROVIDER.toUpperCase()}`);

    const missingKey =
      (PROVIDER === "gemini" && !process.env.GEMINI_API_KEY) ||
      (PROVIDER === "openai" && !process.env.OPENAI_API_KEY) ||
      (PROVIDER === "openrouter" && !process.env.OPENROUTER_API_KEY);
    if (missingKey) {
      console.log("  ----------------------------------------------");
      console.log(`  ⚠  AI_PROVIDER=${PROVIDER} but no API key found in .env`);
      console.log(`     Add your key (GEMINI_API_KEY / OPENAI_API_KEY / OPENROUTER_API_KEY) to .env,`);
      console.log(`     or set AI_PROVIDER=mock for an instant offline demo.`);
    } else if (PROVIDER === "mock") {
      console.log("  (mock mode — keyword demo only, does NOT truly review goods.");
      console.log("   Set AI_PROVIDER=gemini + a key in .env for REAL detection.)");
    } else {
      console.log("  (real AI active — goods will be genuinely reviewed.)");
    }
    console.log("==============================================");
  });
})();
