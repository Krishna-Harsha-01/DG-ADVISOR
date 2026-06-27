/**
 * Authentication & shift-access module
 * ---------------------------------------------------------------
 * Staff log in with a personal 6-character code (starts with "DG",
 * all capitals, e.g. DGAB12). Each staff member belongs to a SHIFT
 * and can only log in / access the app during their shift hours.
 *
 * Shifts (covering 24h, 2 members each):
 *   morning  06:00–14:00
 *   evening  14:00–22:00
 *   night    22:00–06:00  (wraps past midnight)
 *
 * The admin logs in with ADMIN_CODE (from .env) and has no shift limit.
 * Codes are stored in MySQL; login events are logged for the admin.
 * ---------------------------------------------------------------
 */
const crypto = require("crypto");

const SECRET = process.env.AUTH_SECRET || "hk-shipping-dg-secret-change-in-production";
const ADMIN_CODE = (process.env.ADMIN_CODE || "DGADMN").toUpperCase();

const SHIFTS = {
  morning: { label: "Morning", start: 6, end: 14 },
  evening: { label: "Evening", start: 14, end: 22 },
  night:   { label: "Night",   start: 22, end: 6 },
};

const pad = (h) => String(h).padStart(2, "0") + ":00";
function shiftWindow(shift) { const s = SHIFTS[shift]; return s ? `${pad(s.start)}–${pad(s.end)}` : ""; }
function shiftLabel(shift) { return SHIFTS[shift] ? SHIFTS[shift].label : shift; }
function isWithinShift(shift, now = new Date()) {
  const s = SHIFTS[shift];
  if (!s) return false;
  const h = now.getHours();
  return s.start < s.end ? (h >= s.start && h < s.end) : (h >= s.start || h < s.end);
}
function currentShift(now = new Date()) {
  for (const k of Object.keys(SHIFTS)) if (isWithinShift(k, now)) return k;
  return null;
}
/** code must be: DG + 4 capital letters/digits (6 chars total) */
function validCodeFormat(code) { return typeof code === "string" && /^DG[A-Z0-9]{4}$/.test(code); }

// ---- tokens (signed, tamper-proof) ------------------------------
function makeToken(obj) {
  const payload = Buffer.from(JSON.stringify({ ...obj, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
  return payload + "." + sig;
}
function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const [p, sig] = token.split(".");
  if (!p || !sig) return null;
  const exp = crypto.createHmac("sha256", SECRET).update(p).digest("base64url");
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null; } catch { return null; }
  try { return JSON.parse(Buffer.from(p, "base64url").toString()); } catch { return null; }
}
function tokenFromReq(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : (req.query.token || "");
}

// ---- middleware -------------------------------------------------
function requireAuth(req, res, next) {
  const user = verifyToken(tokenFromReq(req));
  if (!user) return res.status(401).json({ ok: false, error: "Not authenticated. Please sign in." });
  // staff may only access during their shift window
  if (user.role === "staff" && !isWithinShift(user.shift)) {
    return res.status(401).json({
      ok: false,
      error: `Your ${shiftLabel(user.shift)} shift (${shiftWindow(user.shift)}) is not active right now. Access is limited to your shift hours.`,
    });
  }
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== "admin") return res.status(403).json({ ok: false, error: "Admin access required." });
    next();
  });
}

module.exports = {
  SHIFTS, ADMIN_CODE, shiftWindow, shiftLabel, isWithinShift, currentShift,
  validCodeFormat, makeToken, verifyToken, requireAuth, requireAdmin,
};
