# G2DM Brand Alert Monitor

Automatically checks 8 Google Alert RSS feeds daily and posts new results to **#g2dm-brand-mentions** on Slack.

## Feeds monitored
- Shortlist
- Jaipal Singh
- David Jani
- ines Bahr
- andrew blair
- GetApp
- Software Advice
- Capterra

## Schedule
Runs every day at **9:00 AM UTC** (2:30 PM IST).

---

## Deploy to Vercel

### Step 1 — Push to GitHub
1. Create a new repo on github.com (name it `g2dm-brand-alerts`)
2. Upload all files from this folder into it

### Step 2 — Import to Vercel
1. Go to vercel.com → **Add New Project**
2. Import your GitHub repo
3. Click **Deploy** (no build settings needed)

### Step 3 — Add Environment Variables
In Vercel project → **Settings** → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/T0978SD5M/...` |
| `CRON_SECRET` | any random string e.g. `g2dm-secret-2026` |

### Step 4 — Redeploy
After adding env variables, go to **Deployments** → click the 3 dots on latest → **Redeploy**.

That's it! Every day at 9AM UTC, new alerts will appear in #g2dm-brand-mentions.
