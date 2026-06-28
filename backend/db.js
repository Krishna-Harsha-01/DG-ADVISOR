/**
 * Data layer — MySQL  (via the mysql2 driver)
 * ----------------------------------------------------------------
 * Stores all data in a MySQL database. On first run it AUTO-CREATES
 * the database and the three tables, so you only need a running MySQL
 * server and the correct login in .env (DB_HOST/DB_PORT/DB_USER/
 * DB_PASSWORD/DB_NAME).
 *
 * Exposes async repository functions; the route files `await` them.
 * ----------------------------------------------------------------
 */
const mysql = require("mysql2");

const CFG = {
  host: process.env.DB_HOST || "mysql-1fed495b-dgadvisor.h.aivencloud.com",
  port: Number(process.env.DB_PORT) || 19040,
  user: process.env.DB_USER || "avnadmin",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "defaultdb",
};

// Debug: log the config being used (hide password)
console.log("[db.init] Configuration:", {
  host: CFG.host,
  port: CFG.port,
  user: CFG.user,
  database: CFG.database,
  passwordSet: !!CFG.password,
});

let pool;

// JSON columns can come back as objects or strings depending on the
// MySQL/driver version — normalise to a JS object either way.
function asObj(v) {
  if (v == null) return v;
  if (typeof v === "object") return v;
  try { return JSON.parse(v); } catch { return v; }
}
function hydrateRow(r) {
  return { ...r, inputs: asObj(r.inputs), ai_response: asObj(r.ai_response) };
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const round2 = (n) => Math.round(n * 100) / 100;
const groupCount = (arr) => { const m = {}; arr.forEach((k) => (m[k] = (m[k] || 0) + 1)); return m; };
const dayOf = (iso) => String(iso || "").slice(0, 10);

// ---- init: create database + tables, then seed -----------------
async function init() {
  // 1) create the database if needed (connect without selecting one)
  const boot = mysql.createConnection({
    host: CFG.host, port: CFG.port, user: CFG.user, password: CFG.password,
  });
  await boot.promise().query("CREATE DATABASE IF NOT EXISTS `" + CFG.database + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await boot.end();

  // 2) pooled connection to the database (dateStrings keeps timestamps as 'YYYY-MM-DD HH:MM:SS')
  pool = mysql.createPool({
    host: CFG.host, port: CFG.port, user: CFG.user, password: CFG.password, database: CFG.database,
    waitForConnections: true, connectionLimit: 10, dateStrings: true,
  }).promise();

  // 3) tables
  await pool.query(`CREATE TABLE IF NOT EXISTS generations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inputs JSON NOT NULL,
    prompt_version VARCHAR(10) NOT NULL DEFAULT 'v5',
    ai_response JSON NOT NULL,
    provider VARCHAR(40) NOT NULL,
    response_time_ms INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    generation_id INT NOT NULL,
    rating INT NOT NULL,
    comment TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_feedback_gen (generation_id),
    CONSTRAINT fk_feedback_gen FOREIGN KEY (generation_id) REFERENCES generations(id)
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS templates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    inputs JSON NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(6) NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    shift VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`);

  await pool.query(`CREATE TABLE IF NOT EXISTS login_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_code VARCHAR(6) NOT NULL,
    staff_name VARCHAR(120) NOT NULL,
    shift VARCHAR(20) NOT NULL,
    role VARCHAR(20) NOT NULL,
    logged_in_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    logged_out_at DATETIME NULL
  ) ENGINE=InnoDB`);

  // migration: add logged_out_at to existing databases that predate it
  await ensureColumn("login_logs", "logged_out_at", "logged_out_at DATETIME NULL");

  await seedTemplates();
  await seedStaff();
  console.log(`[db] MySQL connected — ${CFG.user}@${CFG.host}:${CFG.port}, database '${CFG.database}'`);
}

// ---- templates --------------------------------------------------
async function seedTemplates() {
  const [rows] = await pool.query("SELECT COUNT(*) AS c FROM templates");
  if (rows[0].c > 0) return;
  const presets = [
    { name: "Flammable paint (drums)", description: "Common LTL load — industrial paint to Chennai",
      inputs: { goodsName: "Industrial enamel paint", goodsType: "Flammable liquid", unNumber: "UN1263", physicalState: "Liquid", quantity: "12 drums (200 L each)", packaging: "Steel drums", transportMode: "Road", origin: "Hyderabad", destination: "Chennai", notes: "Mixed LTL truck with general cargo" } },
    { name: "Lithium-ion batteries", description: "E-commerce battery packs to Bengaluru",
      inputs: { goodsName: "Lithium-ion battery packs", goodsType: "Battery / electronics", unNumber: "UN3480", physicalState: "Solid", quantity: "30 cartons", packaging: "Fibreboard boxes", transportMode: "Road", origin: "Hyderabad", destination: "Bengaluru", notes: "Shipped standalone, not installed in equipment" } },
    { name: "Compressed gas cylinders", description: "Industrial oxygen cylinders, FTL",
      inputs: { goodsName: "Compressed oxygen", goodsType: "Compressed gas", unNumber: "UN1072", physicalState: "Gas", quantity: "40 cylinders", packaging: "Steel gas cylinders", transportMode: "Road", origin: "Vijayawada", destination: "Hyderabad", notes: "Full truck load, dedicated vehicle" } },
    { name: "Corrosive cleaning acid", description: "Sulphuric-acid based cleaner to Pune",
      inputs: { goodsName: "Industrial descaling acid", goodsType: "Corrosive", unNumber: "UN1830", physicalState: "Liquid", quantity: "8 carboys (25 L)", packaging: "HDPE carboys in crates", transportMode: "Road", origin: "Hyderabad", destination: "Pune", notes: "Must not be loaded with food-grade cargo" } },
  ];
  for (const p of presets) await addTemplate(p.name, p.description, p.inputs);
  console.log(`[db] Seeded ${presets.length} template presets.`);
}
async function listTemplates() {
  const [rows] = await pool.query("SELECT * FROM templates ORDER BY id ASC");
  return rows.map((r) => ({ ...r, inputs: asObj(r.inputs) }));
}
async function addTemplate(name, description, inputs) {
  const [r] = await pool.query(
    "INSERT INTO templates (name, description, inputs) VALUES (?, ?, ?)",
    [name, description || null, JSON.stringify(inputs)]
  );
  return r.insertId;
}
async function deleteTemplate(id) {
  const [r] = await pool.query("DELETE FROM templates WHERE id = ?", [Number(id)]);
  return r.affectedRows > 0;
}

// ---- generations ------------------------------------------------
async function insertGeneration({ inputs, promptVersion, aiResponse, provider, responseTimeMs }) {
  const [r] = await pool.query(
    "INSERT INTO generations (inputs, prompt_version, ai_response, provider, response_time_ms) VALUES (?, ?, ?, ?, ?)",
    [JSON.stringify(inputs), promptVersion, JSON.stringify(aiResponse), provider, responseTimeMs]
  );
  return r.insertId;
}
async function listGenerations(limit = 50) {
  const [rows] = await pool.query("SELECT * FROM generations ORDER BY id DESC LIMIT ?", [Number(limit)]);
  return rows.map(hydrateRow);
}
async function getGeneration(id) {
  const [rows] = await pool.query("SELECT * FROM generations WHERE id = ?", [Number(id)]);
  return rows.length ? hydrateRow(rows[0]) : null;
}

// ---- feedback ---------------------------------------------------
async function insertFeedback(generationId, rating, comment) {
  const [r] = await pool.query(
    "INSERT INTO feedback (generation_id, rating, comment) VALUES (?, ?, ?)",
    [Number(generationId), Number(rating), comment || null]
  );
  return r.insertId;
}
async function listFeedbackFor(generationId) {
  const [rows] = await pool.query(
    "SELECT id, rating, comment, created_at FROM feedback WHERE generation_id = ? ORDER BY id DESC",
    [Number(generationId)]
  );
  return rows;
}

// ---- analytics --------------------------------------------------
async function quickQuality() {
  const [[g]] = await pool.query("SELECT COUNT(*) AS c FROM generations");
  const [[f]] = await pool.query("SELECT COUNT(*) AS c, AVG(rating) AS a FROM feedback");
  return {
    totalGenerations: g.c || 0,
    totalRatings: f.c || 0,
    averageRating: f.a != null ? round2(Number(f.a)) : 0,
  };
}
async function adminAnalytics(period = "all") {
  const [gensRaw] = await pool.query("SELECT id, inputs, response_time_ms, created_at FROM generations");
  const [fb] = await pool.query("SELECT rating, generation_id, created_at FROM feedback");
  const gens = gensRaw.map((r) => ({ ...r, inputs: asObj(r.inputs) }));
  const ratings = fb.map((f) => f.rating);
  const times = gens.map((g) => g.response_time_ms || 0);

  const byDay = groupCount(gens.map((g) => dayOf(g.created_at)));
  const daily = Object.entries(byDay).map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

  const genDay = Object.fromEntries(gens.map((g) => [g.id, dayOf(g.created_at)]));
  const trendMap = {};
  fb.forEach((f) => { const d = genDay[f.generation_id]; if (!d) return; (trendMap[d] = trendMap[d] || []).push(f.rating); });
  const qualityTrend = Object.entries(trendMap).map(([day, arr]) => ({ day, avgRating: round2(avg(arr)), ratings: arr.length }))
    .sort((a, b) => a.day.localeCompare(b.day)).slice(-14);

  // --- goods-type breakdown, filtered by period (month / year / all) ---
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const inPeriod = (createdAt) => {
    const s = String(createdAt || "");
    if (period === "month") return s.startsWith(`${yyyy}-${mm}`);
    if (period === "year") return s.startsWith(`${yyyy}`);
    return true; // all
  };
  const periodGens = gens.filter((g) => inPeriod(g.created_at));
  const goodsCount = groupCount(periodGens.map((g) => (g.inputs && g.inputs.goodsType) || "").filter(Boolean));
  const topGoodsTypes = Object.entries(goodsCount).map(([goodsType, count]) => ({ goodsType, count }))
    .sort((a, b) => b.count - a.count);

  const distMap = groupCount(ratings.map(String));
  const ratingDistribution = [1, 2, 3, 4, 5].filter((r) => distMap[r]).map((r) => ({ rating: r, count: distMap[r] }));

  return {
    period,
    goodsPeriodTotal: periodGens.length,
    summary: {
      totalGenerations: gens.length,
      totalRatings: ratings.length,
      averageRating: ratings.length ? round2(avg(ratings)) : 0,
      avgResponseMs: times.length ? Math.round(avg(times)) : 0,
    },
    daily, qualityTrend, topGoodsTypes, ratingDistribution,
  };
}

// ---- staff & login logs -----------------------------------------
// Fixed, known access codes (the shift is encoded for easy reference).
// Each is 6 chars, starts with DG. Change names/codes here if you like.
const STAFF = [
  { code: "DGMOR1", name: "Ravi Kumar",   shift: "morning" },
  { code: "DGMOR2", name: "Priya Sharma", shift: "morning" },
  { code: "DGEVE1", name: "Arjun Reddy",  shift: "evening" },
  { code: "DGEVE2", name: "Sneha Patel",  shift: "evening" },
  { code: "DGNIG1", name: "Imran Khan",   shift: "night" },
  { code: "DGNIG2", name: "Lakshmi Nair", shift: "night" },
];
async function seedStaff() {
  // make the staff table match STAFF exactly (resets old random codes)
  const [rows] = await pool.query("SELECT code FROM staff");
  const have = rows.map((r) => r.code).sort().join(",");
  const want = STAFF.map((s) => s.code).sort().join(",");
  if (have !== want) {
    await pool.query("DELETE FROM staff");
    for (const s of STAFF) await pool.query("INSERT INTO staff (code, name, shift) VALUES (?, ?, ?)", [s.code, s.name, s.shift]);
  }
  console.log("[db] Staff access codes (sign in only during the listed shift):");
  STAFF.forEach((s) => console.log(`     ${s.code}   ${s.name.padEnd(14)} ${s.shift} shift`));
  console.log(`     ${process.env.ADMIN_CODE || "DGADMN"}   Administrator    (any time)`);
}
async function getStaffByCode(code) {
  const [rows] = await pool.query("SELECT * FROM staff WHERE code = ?", [String(code).toUpperCase()]);
  return rows[0] || null;
}
async function listStaff() {
  const order = "FIELD(shift,'morning','evening','night'), name";
  const [rows] = await pool.query("SELECT * FROM staff ORDER BY " + order);
  return rows;
}
async function logLogin({ code, name, shift, role }) {
  const [r] = await pool.query(
    "INSERT INTO login_logs (staff_code, staff_name, shift, role) VALUES (?, ?, ?, ?)",
    [code, name, shift, role]
  );
  return r.insertId;
}
// mark the most recent open session for this code as logged out (now)
async function closeLogin(code) {
  await pool.query(
    "UPDATE login_logs SET logged_out_at = NOW() WHERE staff_code = ? AND logged_out_at IS NULL ORDER BY id DESC LIMIT 1",
    [String(code).toUpperCase()]
  );
}
async function listLogins(limit = 200) {
  const [rows] = await pool.query("SELECT * FROM login_logs ORDER BY id DESC LIMIT ?", [Number(limit)]);
  return rows;
}
// add a column only if it doesn't already exist (works on MySQL + MariaDB)
async function ensureColumn(table, column, definition) {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = ? AND table_name = ? AND column_name = ?",
    [CFG.database, table, column]
  );
  if (rows[0].c === 0) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
}

module.exports = {
  init,
  listTemplates, addTemplate, deleteTemplate,
  insertGeneration, listGenerations, getGeneration,
  insertFeedback, listFeedbackFor,
  quickQuality, adminAnalytics,
  getStaffByCode, listStaff, logLogin, closeLogin, listLogins,
};
