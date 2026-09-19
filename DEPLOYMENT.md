# words2voice — Free Deployment Guide (India-Optimised)

*Last verified: 23 Aug 2026*

## What changed since the last version of this guide

Two things about Oracle Cloud's Always Free tier have changed since this guide was
originally written, and they're the reason the old Step 2 wasn't working for you:

1. **The Always Free Ampere A1 (ARM) allowance was cut in half.** It used to be
   4 OCPUs / 24 GB RAM. As of 18 Aug 2026, Oracle enforces **2 OCPUs / 12 GB RAM**
   total, across all your Ampere instances, in every account. This is now the
   official number on Oracle's own docs. 12 GB is still comfortably enough to run
   Supertonic-3 (which needs roughly 2–4 GB), so this doesn't block you — it just
   means the old "4 cores, 24 GB" instructions no longer match what you'll actually
   be offered.
2. **"Out of host capacity" is a real, long-standing, structural problem**, not
   something wrong with how the old guide was written. Ampere A1 free instances are
   in very high demand everywhere, India included, and Oracle's own error message
   for this is literally "Out of host capacity — try a different availability
   domain or try again later." This is why the steps "weren't processing" for you —
   it's not that you did something wrong, it's that Oracle frequently has no free
   ARM capacity to give you at the moment you ask.

The good news: Oracle Always Free is still, by a clear margin, the best "always-on,
real RAM, runs Docker" free option that exists anywhere. Google Cloud's free tier
is a 1 GB e2-micro VM, US-only — not enough for this model. Render, Fly.io and
Railway either sleep or aren't truly free anymore. So the architecture below still
uses Oracle for the TTS box — but this version tells you honestly what to expect,
gives you a concrete way to deal with capacity errors instead of pretending they
won't happen, and gives you a free temporary stand-in so your app can be live
*today* while you wait for an Oracle slot.

---

## Architecture Overview

```
Users (India)
     │
     ▼
Cloudflare Pages ──── Angular SPA ──── CDN-served, ~20-50ms from India
     │  (HTTPS)
     │
     ▼
Render.com (Singapore) ─── Spring Boot API ─── ~80-100ms from India
     │  (HTTPS, free tier)
     │
     ├──► Neon PostgreSQL (Singapore) ─── ~10ms from Render
     │
     └──► Your Laptop ─── FastAPI + Supertonic-3 (Docker container, port 8000)
               ↕ Cloudflare Tunnel (tts.https://words2voice.vercel.app/, named, stable URL)
               Latency depends on your ISP upload speed + Cloudflare routing
```

**Total cost: ₹0/month forever** ✅  
**TTS is live on your laptop right now** 🟢 — the rest of this guide gets it online.

---

## Platform Summary

| What | Where | Free Limits | Notes |
|---|---|---|---|
| Angular Frontend | Cloudflare Pages | Unlimited bandwidth, 500 builds/mo | Excellent India CDN |
| Spring Boot API | Render.com | 750 hrs/mo, 512 MB RAM, sleeps 15min idle | Singapore (closest free region) |
| **FastAPI TTS** | **Your Laptop (Docker)** | **No limits — your own hardware** | **Stable URL via Cloudflare Tunnel** |
| PostgreSQL | Neon (Singapore) | 0.5 GB, 100 CU-hrs/mo | Closest free DB to Render |

---

## Step 0 — Prerequisites

Before starting, make sure:
- [ ] Your code is on **GitHub** (push the repo if not already)
- [ ] You have a domain (optional) — `https://words2voice.vercel.app/` based on your index.html
- [x] Neon DB — you've already done this part ✅

---

## Step 1 — Database: Neon PostgreSQL (Singapore)

You've already completed this step. Leaving the reference here in case you need to
re-check anything.

### 1.1 Create Account
1. Go to **https://neon.tech** → Sign up (free, no credit card)
2. Create a new project:
   - **Name**: `words2voice`
   - **Region**: `AWS Singapore (ap-southeast-1)` ← important for India latency
   - **PostgreSQL version**: 16

### 1.2 Get Connection String
1. In Neon dashboard → **Connection Details**
2. Copy the **Connection string** — it looks like:
   ```
   postgresql://username:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Split it into parts for Render env vars:
   - `DATABASE_URL` = full JDBC URL: `jdbc:postgresql://ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`
   - `DB_USERNAME` = your-neon-username
   - `DB_PASSWORD` = your-neon-password

> The schema.sql will run automatically when the backend starts (spring.sql.init.mode: always). All tables will be created on first boot.

---

## Step 2 — TTS Service: Oracle Cloud Always Free (Mumbai)

This is the step that wasn't working before. Read the whole section before starting
— the order matters, and skipping the capacity strategy is exactly what got you
stuck last time.

### What to expect, honestly

- Oracle's home region is **fixed at signup** and can't be changed afterwards
  without a support ticket. If you haven't signed up yet, choose **India West
  (Mumbai)** as your home region — you want this to match where your users are.
- Mumbai has exactly **one Availability Domain** (this is normal for Oracle's newer
  regions — it's not something you're doing wrong). That means you can't "try a
  different AD in the same region" the way some Oracle troubleshooting pages
  suggest — there's only one to try in Mumbai.
- Because of that, if Mumbai is out of capacity when you try, your realistic
  options are: **(a) keep retrying** (capacity opens up in short, random windows —
  sometimes within hours, sometimes over a few days), or **(b) automate the
  retrying** so you don't have to sit there refreshing the console (Step 2.2 below
  shows you how). Changing your home region to a second India region isn't a quick
  fix — it requires opening a support ticket with Oracle.
- None of this is a reason to give up on Oracle — it's still free forever once you
  land an instance, and 12 GB RAM is plenty for this model. It just means "sign up
  and get a VM in 10 minutes" isn't a realistic expectation, so this guide gives
  you something to run **today** while Oracle capacity comes through.

### 2.1 Create Oracle Cloud Account

1. Go to **https://cloud.oracle.com** → Sign Up
2. Select **Home Region**: `India West (Mumbai)`
3. You need a credit/debit card for identity verification — **you will NOT be
   charged** on Always Free resources. Oracle explicitly states the card is not
   charged unless you deliberately upgrade the account.
4. Complete signup (verification can take a few minutes to a day)

### 2.2 Try to create the VM — and what to do if it says "Out of host capacity"

**First, try the normal way:**

1. In OCI Console → **Compute → Instances → Create Instance**
2. Settings:
   - **Name**: `words2voice-tts`
   - **Image**: Click **Edit** next to Image and shape → select `Canonical Ubuntu
     24.04` (aarch64/ARM build)
   - **Shape**: Click **Change Shape** → **Ampere** → `VM.Standard.A1.Flex`
     - OCPUs: `2`, Memory: `12 GB` ← this is the current Always Free ceiling
       (previously 4/24 — Oracle changed this on 18 Aug 2026)
   - **Networking**: Default VCN is fine
   - **SSH Keys**: Upload your SSH public key (or let Oracle generate one and
     download it — you'll need the private key to SSH in later)
3. Click **Create**

If this succeeds, skip to Step 2.3. If you get:

```
Out of host capacity.
```

or

```
InternalError: Out of host capacity.
```

— this is not an error in what you did. It means Mumbai has no free ARM
capacity available right this second. Here's what actually works, in order of
effort:

**Option A — manual retry (no tools needed).** Just click Create again every
15–30 minutes. Capacity opens in short windows and whoever's trying at that
moment gets it. This can take anywhere from a few hours to a few days depending
on when you're trying.

**Option B — automate the retry (recommended if Option A is taking a while).**
Instead of sitting at your laptop, let a script poll Oracle for you and notify
you the moment a slot opens. This uses Oracle's own official CLI command in a
polite retry loop — it's not a workaround or an exploit, it's the same "click
Create" action, just patient and unattended.

A well-documented, open-source option for this:
**https://github.com/alexpua/oci-arm-catcher**

```bash
git clone https://github.com/alexpua/oci-arm-catcher.git
cd oci-arm-catcher
cp .env.example .env
./scripts/get-config.sh     # prints your account's OCIDs → paste into .env
# edit .env with the values it printed

nohup ./oci-arm-catcher.sh > catcher.log 2>&1 &
tail -f catcher.log
```

It retries every 5 minutes (a polite interval — Oracle rate-limits aggressive
polling), tells the difference between "capacity" errors (keep trying) and real
errors like a typo in your config (stop and tell you), and sends a desktop
notification the moment it lands you an instance. Since Mumbai only has one
Availability Domain, you won't need the multi-AD rotation feature — just leave
`AVAILABILITY_DOMAINS` set to your single Mumbai AD.

Either way — **don't block the rest of your deployment on this.** Do Steps 3
and 4 now, point your backend at the temporary TTS stand-in in Step 2.5, and
come back to swap in the real Oracle box once you've got one.

### 2.3 Open Port 8000 on Firewall

Once your instance is running:

1. OCI Console → **Networking → Virtual Cloud Networks → your-vcn**
2. Click your **Security List** → **Add Ingress Rule**:
   - Source CIDR: `0.0.0.0/0`
   - Protocol: TCP
   - Destination Port: `8000`
3. Also run on the VM itself:
   ```bash
   sudo iptables -I INPUT -p tcp --dport 8000 -j ACCEPT
   sudo netfilter-persistent save
   ```

### 2.4 Install Docker and Deploy TTS Service

SSH into your VM (use the Public IP shown in OCI Console):
```bash
ssh -i your-key.pem ubuntu@YOUR_ORACLE_VM_PUBLIC_IP

# Install Docker
sudo apt-get update
sudo apt-get install -y docker.io docker-compose
sudo usermod -aG docker ubuntu
newgrp docker
```

```bash
# Clone your repo on the VM
git clone https://github.com/YOUR_USERNAME/TTS-Website.git
cd TTS-Website/tts-service

# Build the Docker image (first time takes 10-15 min — downloads model)
docker build -t words2voice-tts .

# Run it (always restart on reboot)
docker run -d \
  --name tts-service \
  --restart always \
  -p 8000:8000 \
  -e PORT=8000 \
  -v tts-model-cache:/home/user/.cache \
  words2voice-tts

# Watch logs
docker logs -f tts-service
# Wait for: Supertonic-3 ready in X.Xs
```

Verify:
```bash
curl http://localhost:8000/health
# Should return: {"status":"ok","ready":true,...}

# Test from your laptop:
curl http://YOUR_ORACLE_VM_PUBLIC_IP:8000/health
```

> Note your Oracle VM's **Public IP** — you'll need it as `TTS_ENGINE_URL` in
> Render (Step 3.4).

**One more thing worth knowing:** Oracle can reclaim an Always Free instance it
considers idle (under 20% CPU, network, and memory utilization over a 7-day
period). A TTS box that's actually serving traffic won't trip this, but if
you're between users for a stretch, a trivial cron job avoids any risk:
```bash
(crontab -l 2>/dev/null; echo "*/10 * * * * dd if=/dev/urandom bs=1k count=1 2>/dev/null | md5sum > /dev/null 2>&1") | crontab -
```

### 2.5 Temporary stand-in while you wait for Oracle capacity

If Steps 2.1–2.4 are still pending because you're waiting on capacity, you don't
have to leave the rest of your stack blocked. Run the exact same
`tts-service/Dockerfile` locally (or on any machine you have handy) and expose it
to the internet temporarily with a tunnel, so `TTS_ENGINE_URL` in Render has
something real to point at:

```bash
cd TTS-Website/tts-service
docker build -t words2voice-tts .
docker run -d --name tts-service -p 8000:8000 -e PORT=8000 words2voice-tts

# In a second terminal — a free Cloudflare quick tunnel, no account needed:
docker run -it --rm cloudflare/cloudflared:latest tunnel --url http://host.docker.internal:8000
```
https://julie-protecting-airlines-hugh.trycloudflare.com/
This prints a `https://random-words.trycloudflare.com` URL. Use that as
`TTS_ENGINE_URL` in Step 3.4 for now. It's slower (running on your machine, not a
Mumbai datacenter) and the tunnel URL changes if you restart it, but it lets you
finish the rest of this deployment, test the full flow end-to-end, and swap in the
real Oracle IP the moment you land an instance — no other steps need to change.

---

## Step 3 — Backend: Render.com (Singapore)

### 3.1 Create Render Account
1. Go to **https://render.com** → Sign up with GitHub
2. Connect your GitHub account

Render's free tier (no card required) is still active as of Aug 2026: 750
hrs/month, 512 MB RAM, and it sleeps after 15 minutes of inactivity — Step 5 below
covers keeping it awake. Render still has no India or Mumbai region; Singapore
remains the closest option, matching the ~80-100ms figure in the platform table
above.

### 3.2 Generate a JWT Secret
Run this on your local machine:
```bash
openssl rand -base64 48
```
6RZGSfFc65TdepCcXHxVaeJfrkvnVVUTOcZUJVfX6fZezoXtVoVtMrGk7FAhKopf
Copy the output — this is your `JWT_SECRET`.

### 3.3 Deploy Backend
1. Render dashboard → **New → Web Service**
2. Connect your GitHub repo: `TTS-Website`
3. Settings:
   - **Name**: `words2voice-backend`
   - **Region**: `Singapore (ap-southeast-1)`
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: **Docker** (Render auto-detects the Dockerfile)
   - **Instance Type**: **Free**

### 3.4 Set Environment Variables
In Render service → **Environment** tab, add:

| Key | Value |
|---|---|
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `DATABASE_URL` | `jdbc:postgresql://ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require` |
| `DB_USERNAME` | your Neon username |
| `DB_PASSWORD` | your Neon password |
| `JWT_SECRET` | (paste the openssl output from 3.2) |
| `TTS_ENGINE_URL` | `http://YOUR_ORACLE_VM_PUBLIC_IP:8000` (or the temporary tunnel URL from Step 2.5) |
| `ALLOWED_ORIGINS` | `https://words2voice.pages.dev,https://https://words2voice.vercel.app/` |

4. Click **Deploy** — watch logs, wait for `Started BackendApplication`

### 3.5 Note Your Backend URL
It will be: `https://words2voice-backend.onrender.com`

**IMPORTANT — Update `frontend/src/environments/environment.prod.ts`:**
```typescript
apiBaseUrl: 'https://words2voice-backend.onrender.com/api'
```
Then commit and push — Cloudflare Pages auto-rebuilds.

---

## Step 4 — Frontend: Cloudflare Pages

### 4.1 Create Cloudflare Account
1. Go to **https://dash.cloudflare.com** → Sign up (free, no payment needed)

### 4.2 Deploy Angular App
1. Cloudflare Dashboard → **Workers & Pages → Create → Pages**
2. **Connect to Git** → Select your GitHub repo `TTS-Website`
3. Build settings:
   - **Framework preset**: `Angular`
   - **Build command**: `cd frontend && npm ci && npm run build -- --configuration=production`
   - **Build output directory**: `frontend/dist/frontend/browser`
   - **Root directory**: `/`
4. Click **Save and Deploy**

### 4.3 Custom Domain (Optional)
If you own `https://words2voice.vercel.app/`:
1. Cloudflare → **Add a Site** → enter `https://words2voice.vercel.app/` → follow nameserver instructions
2. Pages → **Custom Domains** → Add `https://words2voice.vercel.app/`

---

## Step 5 — Keep Render Awake (Prevent Cold Starts)

Render free tier sleeps after 15 min of no traffic.

1. Go to **https://uptimerobot.com** → Sign up (free)
2. Create a monitor:
   - **Type**: HTTP(s)
   - **URL**: `https://words2voice-backend.onrender.com/actuator/health`
   - **Interval**: 5 minutes (UptimeRobot's free plan is fixed at 5-minute checks —
     that's fine here since you just need traffic often enough to stop the
     15-minute sleep timer)

---

## Step 6 — Final: Update & Push

```bash
# 1. Update the production API URL in:
#    frontend/src/environments/environment.prod.ts
#    Replace YOUR_RENDER_BACKEND_URL with your actual Render URL

# 2. Also update ALLOWED_ORIGINS in Render to include your Cloudflare URL

# 3. Push
git add -A
git commit -m "chore: configure production deployment URLs"
git push origin main
# Cloudflare Pages auto-deploys on push
```

---

## Verification Checklist

- [ ] `https://words2voice.pages.dev` loads the landing page
- [ ] Navigating to `/studio` works (no 404 — client-side routing)
- [ ] `https://words2voice-backend.onrender.com/api/public/tts/voices` returns JSON
- [ ] `http://YOUR_ORACLE_IP:8000/health` (or your temporary tunnel URL) shows `"ready": true`
- [ ] Audio generates on the landing page demo
- [ ] Contact form submission completes successfully
- [ ] Terms page back button works

---

## Environment Variables Quick Reference

### Render.com Backend
```
SPRING_PROFILES_ACTIVE=prod
DATABASE_URL=jdbc:postgresql://ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
DB_USERNAME=<neon-user>
DB_PASSWORD=<neon-password>
JWT_SECRET=<64-char-random-string>
TTS_ENGINE_URL=http://<oracle-vm-ip>:8000
ALLOWED_ORIGINS=https://words2voice.pages.dev,https://https://words2voice.vercel.app/
```

---

## SEO — What's Already Done

Your `index.html` already contains:
- Full Schema.org structured data (WebApplication, FAQPage, HowTo, Product)
- Open Graph + Twitter Card meta tags
- India geo tags + hreflang for Hindi/English
- `robots.txt` with sitemap reference
- `sitemap.xml` with all public routes
- Canonical URL set to `https://https://words2voice.vercel.app/`

**Manual steps after going live:**
1. Submit sitemap to Google Search Console: `https://https://words2voice.vercel.app//sitemap.xml`
2. Submit to Bing Webmaster Tools
3. Verify domain ownership via Cloudflare DNS TXT record

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Oracle "Out of host capacity" on create | Not a config error — Mumbai has no free ARM slot right now. Retry manually every 15-30 min, or use the automated catcher in Step 2.2 Option B. Use the Step 2.5 tunnel stand-in in the meantime so the rest of your app stays deployable. |
| Render backend 30s cold start | Set up UptimeRobot (Step 5) |
| TTS loading forever on first build | First Docker build downloads ~2 GB model — wait 15 min |
| CORS error in browser | Check `ALLOWED_ORIGINS` includes your exact Cloudflare URL |
| Angular routes give 404 | Confirm `frontend/public/_redirects` is committed and deployed |
| Neon DB connection refused | Append `?sslmode=require` to JDBC URL |
| TTS 503 "engine not ready" | `docker logs tts-service` on Oracle VM (or your local stand-in) |
| Oracle instance stopped/reclaimed after inactivity | See the idle-prevention cron snippet at the end of Step 2.4 |
