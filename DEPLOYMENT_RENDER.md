# Deploying THREAD Commerce API 100% Free on Render

This guide explains how to deploy the **THREAD NestJS Backend** and **PostgreSQL Database** completely free of charge using **Render** (the platform agreed upon in `PROJECT_SOURCE_OF_TRUTH.md`).

---

## Architecture Overview (100% Free Tier)

| Component | Platform | Free Plan Specs | Cost |
| :--- | :--- | :--- | :--- |
| **Backend Web Service** | [Render.com](https://render.com) | 512 MB RAM, Node.js runtime, custom `.onrender.com` subdomain, free SSL/HTTPS, automatic Git continuous deployment. | **$0 / month** |
| **PostgreSQL Database** | Render Free Postgres *OR* [Neon.tech](https://neon.tech) | Managed cloud PostgreSQL with SSL. | **$0 / month** |

> **Note on Free Web Services:** Render spins down free web services after 15 minutes of inactivity. When a new request arrives, it wakes up automatically in ~30–50 seconds. This is standard behavior for free tiers.

---

## Method 1: Manual Web Dashboard Deployment (Recommended & Easiest)

### Step 1: Push Your Latest Branch to GitHub
Make sure your latest code is on GitHub:
```bash
git push origin Junayed
```

---

### Step 2: Create Your Free PostgreSQL Database

You have two completely free database options:

#### Option A: Render Free PostgreSQL (Direct inside Render)
1. Go to [Render Dashboard](https://dashboard.render.com/) and click **New +** > **PostgreSQL**.
2. **Name:** `thread-db`
3. **Database:** `thread`
4. **User:** `thread_user`
5. **Region:** Select the region closest to you (e.g. `Singapore` or `Frankfurt`).
6. **Plan:** Choose **Free**.
7. Click **Create Database**.
8. Once created, copy the **Internal Database URL** (if deploying web service in same Render region) or **External Database URL**.

#### Option B: Neon.tech Serverless PostgreSQL (Permanently Free, Never Expires)
1. Go to [Neon.tech](https://neon.tech/) and sign in with GitHub.
2. Click **Create Project** -> name it `thread-db`.
3. Copy the **Connection String** (e.g., `postgresql://alex:Abc123xyz@ep-quiet-grass-12345.us-east-2.aws.neon.tech/neondb?sslmode=require`).

---

### Step 3: Create the Free Web Service on Render

1. On the [Render Dashboard](https://dashboard.render.com/), click **New +** > **Web Service**.
2. Select **Build and deploy from a Git repository** and connect your GitHub repo `AWT_Project_Ecommerce`.
3. Fill in the settings:
   * **Name:** `thread-commerce-api` (or a name of your choice, e.g. `thread-api-junayed`)
   * **Region:** Same region as your database (e.g. `Singapore`).
   * **Branch:** `Junayed` (or `main`)
   * **Runtime:** `Node`
   * **Build Command:**
     ```bash
     npm ci && npm run build
     ```
   * **Start Command:**
     ```bash
     npm run db:migrate:prod && npm run start:prod
     ```
   * **Instance Type:** Select **Free** (0.1 CPU, 512 MB).

---

### Step 4: Configure Environment Variables

Scroll down to **Environment Variables** and add the following:

| Key | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations |
| `DATABASE_URL` | `<Your copied PostgreSQL connection string>` | Cloud Postgres URI |
| `JWT_SECRET` | `thread_production_jwt_secret_key_2026_super_secure_32chars` | Must be 32+ characters |
| `SWAGGER_ENABLED` | `true` | Serves interactive Swagger API Docs |
| `PAYMENT_PROVIDER` | `DISABLED` | Safe default for deployment |
| `MAIL_ENABLED` | `false` | Disables SMTP email requirement |

Click **Create Web Service**. Render will now clone your repository, install dependencies, compile the TypeScript code, run your TypeORM migrations automatically, and start the NestJS server!

---

### Step 5: Seed the Database with Default Demo Data

To populate your deployed database with the default catalog, inventory balances, and seeded accounts (`admin@thread.local`, etc.), run the SQL seed runner once.

You can do this directly from your local machine pointing to the cloud database:

**In PowerShell:**
```powershell
$env:DATABASE_URL="<paste-your-cloud-database-url-here>"
npm run seed:sql
```

The script will connect to your remote cloud database via SSL, apply the schema, and seed all demo data!

---

## Method 2: Automatic Blueprint Deployment (`render.yaml`)

We have added a `render.yaml` Blueprint file to the root of the repository.

1. Go to [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Blueprint**.
3. Select your repository `AWT_Project_Ecommerce`.
4. Render will read `render.yaml` and automatically provision:
   * 1 Free Managed PostgreSQL Database (`thread-postgres`)
   * 1 Free Web Service (`thread-commerce-api`)
   * Automatically link the `DATABASE_URL` and generate a cryptographically secure `JWT_SECRET`.
5. Click **Apply**.

---

## Verifying Your Live Deployment

Once Render finishes deploying (Status changes to **Live** with a green checkmark):

1. **Health Check:**
   Open in your browser:
   ```
   https://<your-service-name>.onrender.com/api/v1/health
   ```
   Response: `{"status":"ok"}`

2. **Interactive Swagger Documentation:**
   Open in your browser:
   ```
   https://<your-service-name>.onrender.com/api/docs
   ```
   You can browse all endpoints, inspect DTO schemas, and execute API calls live!

3. **Login as Admin in Postman or Swagger:**
   * **URL:** `https://<your-service-name>.onrender.com/api/v1/auth/login`
   * **Body:**
     ```json
     {
       "email": "admin@thread.local",
       "password": "Password123!"
     }
     ```
   * **Response:** Returns Bearer `accessToken`!
