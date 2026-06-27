/**
 * Simple API test suite (no framework needed).
 * Start the server first:  npm start
 * Then in a second terminal:  npm test
 *
 * The app requires authentication, so this suite logs in first
 * (admin code) and sends the token on every request.
 * Student 3 (Testing & Deployment) extends this file.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_CODE = process.env.ADMIN_CODE || "DGADMN";
let pass = 0, fail = 0;
let TOKEN = "";

function check(name, cond) {
  if (cond) { pass++; console.log(`  \u2713 ${name}`); }
  else { fail++; console.log(`  \u2717 ${name}`); }
}
function authHeaders(extra = {}) {
  return TOKEN ? { Authorization: "Bearer " + TOKEN, ...extra } : extra;
}
async function get(p) {
  const r = await fetch(BASE + p, { headers: authHeaders() });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function post(p, body, useAuth = true) {
  const r = await fetch(BASE + p, {
    method: "POST",
    headers: useAuth ? authHeaders({ "Content-Type": "application/json" }) : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

(async () => {
  console.log(`\nTesting API at ${BASE}\n`);

  console.log("Auth:");
  const badLogin = await post("/api/auth/login", { code: "DGZZZZ" }, false);
  check("invalid access code is rejected", badLogin.status === 401 || badLogin.status === 403);
  const login = await post("/api/auth/login", { code: ADMIN_CODE }, false);
  check("admin can log in", login.json.ok === true && !!login.json.token);
  check("admin role returned", login.json.role === "admin");
  TOKEN = login.json.token;

  console.log("\nAuth guard:");
  const noToken = await fetch(BASE + "/api/history");
  check("protected route without token returns 401", noToken.status === 401);

  console.log("\nHealth:");
  const h = await get("/api/health");
  check("health returns ok", h.json.ok === true);
  check("health reports an AI provider", !!h.json.aiProvider);

  console.log("\nGenerate (valid):");
  const g = await post("/api/generate", {
    goodsName: "Industrial enamel paint", goodsType: "Flammable liquid",
    unNumber: "UN1263", physicalState: "Liquid", quantity: "12 drums",
    packaging: "Steel drums", transportMode: "Road", origin: "Hyderabad", destination: "Chennai",
  });
  check("generate returns 200", g.status === 200);
  check("generate returns an id", typeof g.json.id === "number");
  check("output has classification", g.json.output && g.json.output.classification);
  check("output has regulations list", Array.isArray(g.json.output.regulations));
  const genId = g.json.id;

  console.log("\nGenerate (invalid \u2014 missing required):");
  const bad = await post("/api/generate", { goodsName: "" });
  check("missing fields returns 400", bad.status === 400);
  check("returns validation errors", Array.isArray(bad.json.errors) && bad.json.errors.length > 0);

  console.log("\nDetect (auto category + UN number):");
  const det = await post("/api/detect", { goodsName: "Sulphuric acid" });
  check("detect returns a category", det.json.ok === true && !!det.json.category);

  console.log("\nHistory:");
  const hist = await get("/api/history");
  check("history returns items", Array.isArray(hist.json.items));
  check("newest item is first", hist.json.items[0] && hist.json.items[0].id === genId);
  const one = await get("/api/history/" + genId);
  check("single history detail loads", one.json.item && one.json.item.id === genId);
  const missing = await get("/api/history/999999");
  check("missing history returns 404", missing.status === 404);

  console.log("\nFeedback:");
  const fb = await post("/api/feedback", { generation_id: genId, rating: 5, comment: "Clear and useful" });
  check("feedback accepted", fb.json.ok === true);
  const fbBad = await post("/api/feedback", { generation_id: genId, rating: 9 });
  check("invalid rating rejected", fbBad.status === 400);

  console.log("\nTemplates:");
  const tpl = await get("/api/templates");
  check("templates list returns items", tpl.json.items && tpl.json.items.length > 0);

  console.log("\nAnalytics (admin):");
  const q = await get("/api/analytics/quality");
  check("quality summary returns numbers", typeof q.json.totalGenerations === "number");
  const a = await get("/api/admin/analytics");
  check("admin analytics has summary", a.json.summary && typeof a.json.summary.totalGenerations === "number");
  check("admin analytics has daily array", Array.isArray(a.json.daily));
  check("admin analytics has goods breakdown", Array.isArray(a.json.topGoodsTypes));

  console.log("\nAdmin \u2014 staff & login log:");
  const staff = await get("/api/admin/staff");
  check("staff roster returns 6 members", staff.json.staff && staff.json.staff.length === 6);
  const logins = await get("/api/admin/logins");
  check("login log records sign-ins", Array.isArray(logins.json.logins) && logins.json.logins.length > 0);

  console.log(`\n${"=".repeat(40)}`);
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  console.log(`${"=".repeat(40)}\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("Test run failed:", e.message); process.exit(1); });
