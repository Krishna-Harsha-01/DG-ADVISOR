/**
 * POST /api/auth/login   Body: { code }
 *   - validates the 6-char DG code
 *   - admin code -> admin (no shift limit)
 *   - staff code -> only if current time is within their shift
 *   - logs every successful login for the admin
 * GET  /api/auth/me      -> current user from token
 */
const express = require("express");
const router = express.Router();
const db = require("../db");
const { ADMIN_CODE, isWithinShift, shiftWindow, shiftLabel, validCodeFormat, makeToken, verifyToken } = require("../auth");

router.post("/login", async (req, res) => {
  const code = String((req.body || {}).code || "").trim().toUpperCase();
  if (!validCodeFormat(code)) {
    return res.status(400).json({ ok: false, error: "Enter a valid 6-character code that starts with DG (e.g. DGAB12)." });
  }

  // admin
  if (code === ADMIN_CODE) {
    const token = makeToken({ code, name: "Administrator", role: "admin", shift: null });
    try { await db.logLogin({ code, name: "Administrator", shift: "admin", role: "admin" }); } catch {}
    return res.json({ ok: true, token, role: "admin", name: "Administrator", shift: null });
  }

  // staff
  let staff;
  try { staff = await db.getStaffByCode(code); }
  catch (e) { return res.status(500).json({ ok: false, error: "Server error. Please try again." }); }
  if (!staff) return res.status(401).json({ ok: false, error: "Invalid access code. Please check and try again." });

  if (!isWithinShift(staff.shift)) {
    return res.status(403).json({
      ok: false,
      error: `Access denied. You are on the ${shiftLabel(staff.shift)} shift (${shiftWindow(staff.shift)}). You can only log in during your shift hours.`,
    });
  }

  const token = makeToken({ code: staff.code, name: staff.name, role: "staff", shift: staff.shift });
  try { await db.logLogin({ code: staff.code, name: staff.name, shift: staff.shift, role: "staff" }); } catch {}
  res.json({ ok: true, token, role: "staff", name: staff.name, shift: staff.shift, shiftLabel: shiftLabel(staff.shift) });
});

router.get("/me", (req, res) => {
  const h = req.headers["authorization"] || "";
  const user = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (!user) return res.status(401).json({ ok: false });
  res.json({ ok: true, ...user });
});

// records the logout time. Verifies the token SIGNATURE only (not the shift),
// so a session that ended because the shift finished can still be closed out.
router.post("/logout", async (req, res) => {
  const h = req.headers["authorization"] || "";
  const user = verifyToken(h.startsWith("Bearer ") ? h.slice(7) : "");
  if (user && user.code) { try { await db.closeLogin(user.code); } catch {} }
  res.json({ ok: true });
});

module.exports = router;
