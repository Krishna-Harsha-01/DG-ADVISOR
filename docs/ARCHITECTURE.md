# System Architecture

## Overview
The app is a classic three-tier web application:

1. **Frontend** — static HTML/CSS/JS served by Express (no build step). The browser
   never talks to the AI or database directly; it only calls the backend API.
2. **Backend** — Node.js + Express. Handles authentication, builds the AI prompt,
   calls the AI provider, parses the response, and reads/writes MySQL.
3. **Data + AI** — MySQL stores all data; an external AI provider (OpenRouter/Gemini/
   OpenAI) generates the guidance.

## Diagram

```
                          ┌─────────────────────────────────────────────┐
                          │                 BROWSER                      │
                          │  login · advisor · history · admin · access  │
                          └───────────────┬─────────────────────────────┘
                                          │  HTTPS/JSON  (Bearer token)
                                          ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                      EXPRESS SERVER (server.js)                    │
        │                                                                    │
        │   requireAuth / requireAdmin  ◄── validates signed token + shift   │
        │                                                                    │
        │   routes/                                                          │
        │     auth      generate     detect     history                      │
        │     feedback  analytics    templates                               │
        │        │           │          │                                    │
        │        │           ▼          ▼                                    │
        │        │     prompt.js     ai.js  ───────────►  AI PROVIDER         │
        │        │   (build prompt)  (call + parse)       (OpenRouter /       │
        │        │                       ▲                 Gemini / OpenAI)   │
        │        ▼                       │                                    │
        │     db.js  ◄───────────────────┘   save inputs + AI response       │
        └────────────────────────────────┬─────────────────────────────────┘
                                          │  mysql2
                                          ▼
                          ┌─────────────────────────────────────────────┐
                          │                  MySQL                       │
                          │  generations · feedback · templates ·        │
                          │  staff · login_logs                          │
                          └─────────────────────────────────────────────┘
```

## Request lifecycle (generate a compliance check)
1. Staff logs in → backend returns a signed token (HMAC) carrying role + shift.
2. Browser sends `POST /api/generate` with the form data and the token.
3. `requireAuth` verifies the token signature and that the staff member is within shift.
4. `prompt.js` builds a structured prompt from the inputs (system + user prompt).
5. `ai.js` sends it to the configured AI provider with a 30-second timeout.
6. The AI response is parsed into structured JSON.
7. `db.js` saves the inputs, prompt version, AI response, provider and response time.
8. The JSON is returned and the browser renders the guidance.

## Key backend modules
| File | Responsibility |
|------|----------------|
| `server.js` | Express setup, route mounting, auth guards, static hosting |
| `backend/auth.js` | Shift windows, token sign/verify, `requireAuth` / `requireAdmin` |
| `backend/prompt.js` | System prompt + user-prompt builder, prompt version |
| `backend/ai.js` | Provider calls (OpenRouter/Gemini/OpenAI/mock), auto-detect, parsing, timeout |
| `backend/db.js` | MySQL connection, table creation, seeding, all queries |
| `backend/routes/*` | One file per resource (auth, generate, detect, history, feedback, analytics, templates) |

## Security notes
- Tokens are signed with `AUTH_SECRET` (HMAC-SHA256) and verified on every request.
- Staff access is limited to their shift window on **every** request, not just at login.
- The AI key lives in `.env` (never in code or git).
