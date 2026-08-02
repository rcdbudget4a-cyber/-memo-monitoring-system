# ☁️ Cloudflare Pages & Workers Deployment Guide
**System**: RCD Incoming/Outgoing Memorandum Monitoring System (PRO 4A)

Nakahanda na ang system para i-deploy at i-host sa **Cloudflare Pages**.

---

## 🚀 Key Advantages of Cloudflare Pages

1. **Lightning Fast Global CDN**: Free SSL certificate, fast edge hosting across 300+ cities worldwide.
2. **Zero Hosting Cost**: Free tier includes unlimited requests and bandwidth for static hosting.
3. **Automatic Deployments**: Automatic build and deploy on `git push`.
4. **Cloudflare Functions Support**: Serverless API `/api/health` built-in.

---

## 🛠️ Option 1: Direct Deploy via Cloudflare CLI (`wrangler`)

### Step 1: Install Dependencies (Optional)
Siguraduhing nakakonekta ang Node.js sa iyong computer, tapos i-run sa terminal:
```bash
npm install
```

### Step 2: Local Testing with Cloudflare Pages Dev Server
Para suriin ang site sa iyong local machine gamit ang Cloudflare Pages environment:
```bash
npm run dev
```
O direktang i-run:
```bash
npx wrangler pages dev .
```
Magbubukas ang local server sa `http://localhost:8788`.

### Step 3: Deploy to Cloudflare Pages
I-deploy ang app sa Cloudflare sa pamamagitan ng command na ito:
```bash
npx wrangler pages deploy . --project-name=rcd-memo-monitoring-system
```
*Note: Sa unang beses na patakbuhin ito, hihilingin ng Cloudflare na mag-log in ka sa iyong Cloudflare account sa browser.*

---

## 🐙 Option 2: Automatic Deploy via Cloudflare Dashboard (GitHub Integration)

1. Mag-sign in sa **[Cloudflare Dashboard](https://dash.cloudflare.com/)**.
2. Pumunta sa **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**.
3. Piliin ang iyong GitHub repository: `-memo-monitoring-system-main`.
4. I-configure ang **Build settings**:
   - **Framework preset**: `None` (Static HTML/JS)
   - **Build command**: *(Iwanang walang laman / empty)*
   - **Build output directory**: `.`
5. I-click ang **Save and Deploy**.

---

## 📁 Cloudflare Configuration Files Included

- **`wrangler.toml`**: Cloudflare Wrangler project settings.
- **`_headers`**: Edge CDN rules for Security Headers, CORS, and Caching.
- **`_redirects`**: Single Page Application (SPA) routing fallback rule (`/* /index.html 200`).
- **`functions/api/health.js`**: Serverless Edge Function for `/api/health` health checks.
- **`package.json`**: NPM deployment scripts (`npm run dev`, `npm run deploy`).
