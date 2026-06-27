# API Reference

Base URL: `http://localhost:3000`
All protected routes require a header: `Authorization: Bearer <token>`.

## Auth (public)
### POST /api/auth/login
Body: `{ "code": "DGADMN" }`
→ `{ ok, token, role, name, shift }`  ·  401 invalid code  ·  403 outside shift

### POST /api/auth/logout
Records the logout time for the current token. → `{ ok: true }`

### GET /api/auth/me
→ current user decoded from the token.

## Health (public)
### GET /api/health
→ `{ ok, status, aiProvider }`

## Generate (protected)
### POST /api/generate
Body: `{ goodsName*, goodsType*, unNumber, physicalState, quantity, packaging,
transportMode, origin, destination, notes }`
→ `{ ok, id, inputs, output, provider, responseTimeMs, promptVersion, createdAt }`
- 400 validation error · 502 AI error (timeout / rate limit / empty / bad key)

`output` contains: `isDangerous`, `classification` (unNumber, hazardClass, packingGroup),
`regulations[]`, `packaging[]`, `labelling[]`, `documentation[]`, `handling[]`,
`warnings[]`, `transportFeasibility`.

## Detect (protected)
### POST /api/detect
Body: `{ "goodsName": "Sulphuric acid" }`
→ `{ ok, category, unNumber, confidence, provider }`
- Real, specific UN number when confident; `""` when unsure (manual entry);
  `"N/A"` for non-hazardous goods.

## History (protected)
### GET /api/history?limit=50 → `{ ok, count, items[] }` (newest first)
### GET /api/history/:id → `{ ok, item }` (includes its feedback) · 404 if missing

## Feedback (protected)
### POST /api/feedback
Body: `{ generation_id*, rating* (1–5), comment? }` → `{ ok, id }` · 400 invalid

## Templates / presets
### GET /api/templates (protected) → `{ ok, items[] }`
### POST /api/templates (admin) Body: `{ name*, description, inputs* }` → `{ ok, id }`
### DELETE /api/templates/:id (admin) → `{ ok }` · 404 if missing

## Analytics (admin)
### GET /api/admin/analytics?period=month|year|all
→ `{ ok, period, goodsPeriodTotal, summary, daily[], qualityTrend[], topGoodsTypes[], ratingDistribution[] }`
### GET /api/analytics/quality → quick summary
### GET /api/admin/staff → roster with shift + on-shift status
### GET /api/admin/logins → login/logout activity log
