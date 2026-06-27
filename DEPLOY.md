# Deployment Guide

**DG Advisor** — Production deployment to **GitHub** + **Vercel**

---

## Prerequisites

- **Node.js 18+** installed locally (check: `node -v`)
- **Git** installed (check: `git --version`) — [download here](https://git-scm.com/downloads)
- **GitHub account** — [sign up here](https://github.com)
- **Vercel account** — [sign up here](https://vercel.com/signup) (use your GitHub account)
- **MySQL database** in the cloud (PlanetScale or AWS RDS — see "Database Setup" below)
- **AI API key** (OpenRouter, Gemini, or OpenAI — see `.env.example`)

---

## Step 1: Prepare the Repository

1. Open a terminal in your project root:
   ```bash
   cd /path/to/dg-advisor
   ```

2. Initialize Git (if not already done):
   ```bash
   git init
   ```

3. Stage all files:
   ```bash
   git add .
   ```

4. Commit:
   ```bash
   git commit -m "Initial commit: DG Advisor production ready"
   ```

5. Set the main branch:
   ```bash
   git branch -M main
   ```

---

## Step 2: Push to GitHub

1. Go to [github.com/new](https://github.com/new) and create a new repository:
   - **Name:** `dg-advisor` (or whatever you like)
   - **Visibility:** Public or Private
   - **DO NOT** check "Add README" or "Add .gitignore" (we already have them)
   - Click **Create repository**

2. Copy the repository URL (looks like `https://github.com/YOUR_USERNAME/dg-advisor.git`)

3. Link your local repo to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/dg-advisor.git
   ```

4. Push:
   ```bash
   git push -u origin main
   ```

Your code is now on GitHub! ✅

---

## Step 3: Database Setup (PlanetScale)

**Why?** Vercel is stateless — you need a cloud database. PlanetScale is the easiest (MySQL-compatible, free tier available).

1. Go to [planetscale.com](https://planetscale.com) and sign up (use GitHub auth)

2. Click **New database** → name it `dg_advisor` → **Create**

3. Click **Connect** → choose **Node.js** → copy the connection string

4. It will look like:
   ```
   mysql://username:password@aws.connect.psdb.cloud/dg_advisor?ssl={"rejectUnauthorized":true}
   ```

5. **Parse it** into these variables (you'll need them in Step 5):
   - `DB_HOST` = the hostname (e.g., `aws.connect.psdb.cloud`)
   - `DB_PORT` = `3306`
   - `DB_USER` = the username
   - `DB_PASSWORD` = the password part
   - `DB_NAME` = `dg_advisor`

**Alternative:** AWS RDS — [guide here](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.MySQL.html)

---

## Step 4: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub

2. Click **Import Project** → choose your `dg-advisor` repository from the list

3. Vercel auto-detects `vercel.json` — just click **Deploy**

4. **Wait ~2 minutes** for the build. You'll see:
   ```
   ✅ Deployment ready
   ```

5. Copy your **live URL** (e.g., `https://dg-advisor.vercel.app`)

---

## Step 5: Add Environment Variables

Your app needs database credentials and an AI key. Vercel pulls these from **Environment Variables** (not `.env` — that file is local only and excluded by `.gitignore`).

1. In Vercel, go to **Project Settings** → **Environment Variables**

2. Add these one by one:

| Name                | Value                                     | Notes                                      |
|---------------------|-------------------------------------------|--------------------------------------------|
| `DB_HOST`           | (from PlanetScale connection string)      | e.g., `aws.connect.psdb.cloud`             |
| `DB_PORT`           | `3306`                                    |                                            |
| `DB_USER`           | (from PlanetScale)                        |                                            |
| `DB_PASSWORD`       | (from PlanetScale)                        | Keep this secret!                          |
| `DB_NAME`           | `dg_advisor`                              |                                            |
| `AI_PROVIDER`       | `openrouter` (or `gemini` / `openai`)    | Choose one                                 |
| `OPENROUTER_API_KEY`| (your OpenRouter key)                     | Get from [openrouter.ai/keys](https://openrouter.ai/keys) |
| `OPENROUTER_MODEL`  | `openai/gpt-4o-mini`                      | Fast + cheap; use `openai/gpt-4o` for best quality |
| `ADMIN_CODE`        | `DGADMN`                                  | Admin login code (change if you like)      |
| `AUTH_SECRET`       | `your-random-32-char-string-here`         | Change this! Generate with: `openssl rand -hex 16` |

3. Click **Save** for each

4. Redeploy: **Deployments** tab → click ⋯ on the latest → **Redeploy**

---

## Step 6: Test the Deployment

1. Open your Vercel URL: `https://dg-advisor.vercel.app`

2. **Health check:** open `https://dg-advisor.vercel.app/api/health`
   - You should see: `{"ok":true,"status":"up","aiProvider":"openrouter"}`

3. **Login:** go to `/login.html` and sign in with `DGADMN` (the admin code)

4. **Run a compliance check** — try "Industrial enamel paint" → generate guidance

5. **Check analytics** — if you see data, everything works! 🎉

---

## Troubleshooting

### ❌ "Could not connect to MySQL"
- Check your `DB_*` env vars are correct in Vercel
- Verify the PlanetScale database is active (not sleeping)
- Redeploy after fixing

### ❌ "AI provider is not configured correctly"
- Check `OPENROUTER_API_KEY` is set in Vercel
- Verify the key works: test at [openrouter.ai](https://openrouter.ai)

### ❌ 502 Bad Gateway
- Check the **Runtime Logs** in Vercel → look for errors
- Likely a database or env var issue

### ❌ "Cannot GET /"
- Vercel serves `frontend/index.html` as the root — check `server.js` has `app.use(express.static(path.join(__dirname, "frontend")))`
- If missing, redeploy

---

## Updating the App

After making code changes:

```bash
git add .
git commit -m "Your change description"
git push origin main
```

Vercel **auto-deploys** from the `main` branch — no manual redeploy needed (takes ~2 min).

---

## Custom Domain (Optional)

1. Buy a domain (Namecheap, Google Domains, etc.)
2. In Vercel: **Project Settings** → **Domains** → add your domain
3. Follow Vercel's DNS instructions

---

## Production Checklist

- [ ] `.env` is in `.gitignore` (yes — already done)
- [ ] Environment variables set in Vercel
- [ ] Database is cloud-hosted (PlanetScale / AWS RDS)
- [ ] Admin code changed from default
- [ ] `AUTH_SECRET` is a long random string
- [ ] Health endpoint returns `ok: true`
- [ ] Login works with admin code
- [ ] Compliance checks generate guidance
- [ ] Analytics dashboard loads

---

## Support

- **GitHub Issues:** [your-repo/issues](https://github.com/YOUR_USERNAME/dg-advisor/issues)
- **Vercel Docs:** [vercel.com/docs](https://vercel.com/docs)
- **PlanetScale Docs:** [planetscale.com/docs](https://planetscale.com/docs)

**Good luck! 🚀**
