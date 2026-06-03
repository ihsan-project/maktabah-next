# Maktabah

A search application for Quran translations and Hadith collections, built with Next.js, TypeScript, and Firebase, powered by AWS OpenSearch.

## Features

- **Type Safety**: Full TypeScript implementation
- **Authentication**: Google Sign-in with Firebase Authentication
- **Search**: OpenSearch integration with Arabic/English analyzers, semantic vector search (Cohere via Bedrock), and hybrid search with RRF
- **Responsive Design**: Mobile-friendly interface with sliding menu
- **Protected Routes**: Authentication-required routes

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Authentication**: Firebase Authentication
- **Search**: AWS OpenSearch + Cohere Embeddings via Amazon Bedrock
- **Hosting**: Firebase App Hosting (managed Next.js SSR on Cloud Run)
- **API**: Firebase Cloud Functions (MCP server)

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- AWS account with OpenSearch and Bedrock access

## AWS OpenSearch Setup

### 1. Create an OpenSearch Domain

1. Go to the [AWS OpenSearch Console](https://console.aws.amazon.com/aos/home)
2. Click **Create domain**
3. Configure:
   - **Domain name:** `maktabah`
   - **Deployment type:** Development and testing
   - **Engine version:** OpenSearch 3.3 (latest)
   - **Instance type:** `t3.small.search` (2 vCPU, 2 GB RAM — sufficient for this workload)
   - **Number of nodes:** 1
   - **Storage:** 10 GB EBS (General Purpose SSD gp3)

   > **Instance sizing notes:** Vector search (KNN) uses additional memory (~4 bytes x 1024 dimensions x doc count). For ~120k documents this adds ~500MB. Use `t3.medium.search` (4 GB RAM) or larger to accommodate both text and vector indices. Avoid previous-generation `t2` instances — they don't support fine-grained access control or encryption at rest.
4. Under **Network:**
   - Choose **Public access** for simplicity, or **VPC access** for production
5. Under **Fine-grained access control:**
   - Enable fine-grained access control
   - Create a master user with username and password
6. Under **Access policy:**
   - Select "Only use fine-grained access control"
7. Click **Create**

Wait for the domain status to become **Active** (takes ~15 minutes).

The value for `OPENSEARCH_URL` can be found under the "Domain endpoint v2 (dual stack)"

### 2. Enable Cohere Embeddings on Amazon Bedrock

The semantic search feature uses Cohere's multilingual embedding model via Amazon Bedrock.

> **Note:** Bedrock model access is per-region. Make sure you enable it in the same region as your OpenSearch domain (default: `us-east-1`).

1. Go to the [AWS Bedrock Console](https://console.aws.amazon.com/bedrock/home) in the same region as your OpenSearch domain.
2. **Model access** → **Modify model access** → enable **Cohere Embed Multilingual v3** → submit. Access is typically granted within a few minutes.

### 3. Create an IAM User for Firebase Functions

Firebase Functions authenticate to both OpenSearch (via SigV4 request signing) and Bedrock using a single IAM user with narrowly scoped permissions.

1. **IAM Console** → **Users** → **Create user**:
   - **User name:** `maktabah-functions`
   - Do **not** enable console access — this user is programmatic-only.
   - On the permissions step, select **Attach policies directly** but do not select any managed policy. You'll add an inline policy next.
2. Open the new user → **Permissions** tab → **Add permissions** → **Create inline policy** → **JSON** tab → paste:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "OpenSearchHttpAccess",
         "Effect": "Allow",
         "Action": ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpHead"],
         "Resource": "arn:aws:es:us-east-1:<ACCOUNT_ID>:domain/maktabah/*"
       },
       {
         "Sid": "BedrockInvokeEmbedding",
         "Effect": "Allow",
         "Action": "bedrock:InvokeModel",
         "Resource": "arn:aws:bedrock:us-east-1::foundation-model/cohere.embed-multilingual-v3"
       }
     ]
   }
   ```
   Replace `<ACCOUNT_ID>` with your AWS account ID (top-right of the console, or `aws sts get-caller-identity --query Account --output text`). Name the policy `maktabah-functions-policy`.
3. **Security credentials** tab → **Access keys** → **Create access key** → use case **Application running outside AWS**. Save the access key ID and secret — you'll paste them into Firebase secrets in step 7.

> **Why narrow permissions?** `es:ESHttp*` governs the signed HTTP calls to the domain and `bedrock:InvokeModel` is the single action needed for embeddings. Avoid `AmazonBedrockFullAccess` or `es:*` — least privilege.

### 4. Map the IAM User in OpenSearch Dashboards

The IAM policy lets the user *reach* the domain, but OpenSearch's fine-grained access control (FGAC) must also grant it *search* permissions inside the cluster. Skipping this step will cause every request to return `403 security_exception`.

1. Open the [Amazon OpenSearch Service console](https://console.aws.amazon.com/aos/home/) → **Domains** → click your domain name.
2. On the **General information** panel, click the **OpenSearch Dashboards URL** (looks like `https://<domain-endpoint>/_dashboards/`). Log in with the master user created in step 1.
3. In the **left navigation pane** (collapse/expand icon at the top-left), under **Management**, choose **Security** → **Roles**.
4. Select a role — `all_access` is simplest for a server-side app; a custom read/write role scoped to the `kitaab` index is tighter.
5. **Mapped users** tab → **Manage mapping**. Because `maktabah-functions` is an IAM **user** (not an IAM role), paste its ARN into the **Users** field:
   ```
   arn:aws:iam::<ACCOUNT_ID>:user/maktabah-functions
   ```
   Click **Map**.

> **Users vs. Backend roles:** IAM **user** ARNs (`.../user/...`) go in the **Users** field. IAM **role** ARNs (`.../role/...`) go in the **Backend roles** field. Putting an IAM user ARN in the wrong field is the most common cause of 403s at this step. See the AWS docs on [mapping roles to users](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/fgac.html#fgac-mapping).

### 5. Get Your Domain Endpoint

Once active, copy the **Domain endpoint** from the AWS console. It looks like:
```
https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
```

### 6. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# OpenSearch Configuration
OPENSEARCH_URL=https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
OPENSEARCH_USERNAME=your_master_username
OPENSEARCH_PASSWORD=your_master_password
OPENSEARCH_INDEX=kitaab

# Firebase App Check (bot protection for /api/search and /api/storage)
# See "Firebase App Check Setup" section below for how to create the site key
# and register a debug token.
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your-recaptcha-enterprise-site-key
NEXT_PUBLIC_APP_CHECK_DEBUG=true
APP_CHECK_ENFORCE=false

# Analytics
NEXT_PUBLIC_MIXPANEL_TOKEN=your_mixpanel_token
```

For the quran_loader, create `quran_loader/.env`. The loader also uses SigV4 for OpenSearch and the same AWS credentials for Bedrock embeddings:

```env
OPENSEARCH_URL=https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com

# AWS credentials for BOTH OpenSearch SigV4 and Bedrock embeddings.
# Use the maktabah-functions IAM user from step 3 (or a separate IAM user
# with the same permissions, mapped in OpenSearch Dashboards per step 4).
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

### 7. Set Firebase Function Secrets

Firebase Functions authenticate to OpenSearch using SigV4 with the IAM user's credentials — no username/password needed.

```bash
firebase functions:secrets:set OPENSEARCH_URL
# Enter your OpenSearch domain endpoint when prompted

firebase functions:secrets:set AWS_ACCESS_KEY_ID
# Paste the access key ID for maktabah-functions (from step 3)

firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
# Paste the secret access key for maktabah-functions
```

### 8. Load Data into OpenSearch

From `/quran-loader` directory (due to using node parameters):
```bash
# Install dependencies
npm install

# Load Quran translations
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="quran"

# Load Hadith collections
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="bukhari" --volume=1
```

The loader creates the `kitaab` index with custom Arabic/English analyzers and a `knn_vector` field for semantic search. Each document's text is embedded using Cohere Embed Multilingual v3 (1024 dimensions) via Bedrock during indexing.

### Search Modes

The search API supports three modes via the `mode` query parameter:

| Mode | Description | When to use |
|------|-------------|-------------|
| `text` | Classic BM25 keyword search | Exact word/phrase matching |
| `semantic` | KNN vector search using Cohere embeddings | Conceptual queries like "verses about patience" |
| `hybrid` | BM25 + KNN merged with Reciprocal Rank Fusion | Best of both — the default for most use cases |

Example: `/api/search?q=mercy+and+compassion&mode=hybrid`

### Rate Limiting

`/api/search` is rate-limited to **30 requests per minute per client IP** to prevent abuse on this paid-backend endpoint (OpenSearch + Bedrock).

- **Storage:** Firestore, flat under the `rateLimits/` root collection. Each `(bucket, minute, IP)` is its own doc at `rateLimits/{bucket}_{minuteKey}_{ipHash}` with `{ count, expiresAt }`. A Firestore TTL policy on the collection auto-deletes docs ~5 minutes after the window ends. Flat layout (rather than a parent doc with `ips/` subcollection) avoids both the TTL non-cascade issue and the contention hotspot of a single bucket doc.
- **Behavior on limit hit:** HTTP `429 Too Many Requests` with body `{"error":"Too many requests"}` and a `Retry-After: <seconds>` header.
- **Behavior on Firestore outage:** Fail-open — the request proceeds, a `console.warn` is logged. We don't punish users for our infra problems.
- **Tuning:** Edit the call in [`app/api/search/route.ts`](app/api/search/route.ts) — `requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 })`. A `git commit` + push to `main` deploys the change via App Hosting in ~3–5 minutes.

The helper itself is generic (`lib/server/rate-limit.ts`) and can be applied to any other route by passing a different `bucket` name.

#### One-time Firestore TTL setup

The auto-cleanup of stale buckets requires a TTL policy in the Firebase Console:

1. **Google Cloud Console** (console.cloud.google.com) → **Firestore Database** → **TTL** tab → **Add policy**.
2. **Collection group:** `rateLimits`. **Timestamp field:** `expiresAt`.
3. Save.

Firestore will start auto-deleting expired bucket docs within ~24h of the policy taking effect. The rate-limit code works without this step (counters just accumulate as small docs); the TTL keeps storage costs near zero.

## Firebase App Check Setup

### 1. Why App Check

`/api/search` and `/api/storage` are gated by Firebase App Check to prevent abuse (scraping, bot traffic) on these expensive endpoints. The server-side helper `requireAppCheck` (in `lib/server/app-check.ts`) verifies a `X-Firebase-AppCheck` JWT on every request. The client wrapper `appCheckFetch` (in `lib/appCheckFetch.ts`) attaches the token automatically. Enforcement is gated by the `APP_CHECK_ENFORCE` env var so it can be flipped off without a code change.

### 2. Enable reCAPTCHA Enterprise in GCP

- Open the [reCAPTCHA Enterprise Console](https://console.cloud.google.com/security/recaptcha) for your Firebase/GCP project.
- If prompted, enable the **reCAPTCHA Enterprise API**.
- The free tier is 10,000 assessments per month — comfortable for typical traffic; set a billing alert if you expect to exceed it.

### 3. Create a Site Key

- Click **Create key**.
- **Platform type:** Website.
- **Domains:** add your production domain (e.g. `maktabah.app`) and `localhost` for local dev.
- **Use checkbox challenge:** No (we want score-based, invisible).
- Save and copy the **site key**. (Important: if you also see a "legacy secret key", **ignore it** — Firebase App Check does not use it; that field is only for standalone reCAPTCHA Enterprise integrations.)

### 4. Register the Site Key with Firebase App Check

- Firebase Console → your project → **App Check** → **Apps** tab → click your web app.
- Choose **reCAPTCHA Enterprise** as the provider.
- Paste the site key from step 3. Save.

### 5. Local Dev — Register a Debug Token

Localhost can't pass reCAPTCHA on its own, so App Check supports per-developer debug tokens.

1. Add to your `.env.local` (see the example block in the AWS OpenSearch Setup, step 6):
   ```env
   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<the site key from step 3>
   NEXT_PUBLIC_APP_CHECK_DEBUG=true
   APP_CHECK_ENFORCE=false
   ```
2. Start the dev server: `npm run dev`.
3. Open `http://localhost:3000` in your browser → DevTools Console.
4. Look for a line like `App Check debug token: <UUID>`. Copy the UUID.
5. Firebase Console → **App Check** → **Apps** → web app → **Manage debug tokens** → **Add debug token** → paste the UUID → name it (e.g. `local dev <your-name>`) → save.
6. Reload the page. You should now see `{"kind":"app-check","route":"/api/...","enforced":false,"result":"pass"}` lines in the dev server terminal when you exercise search or visit Quran pages.

> **Why `APP_CHECK_ENFORCE=false` locally?** The kill switch (off) lets requests through even if verification fails — useful while you're setting up the debug token. Once it works, you can flip to `APP_CHECK_ENFORCE=true` locally to match production behavior.

> **Note:** Debug tokens accumulate over time as devs come and go. Periodically prune the list in the Firebase Console.

### 6. Production — App Hosting Env Vars

The production deploy needs the site key (so the client SDK can attest) and the enforcement flag (so the server rejects unauthenticated calls). These live in `apphosting.yaml`:

```yaml
- variable: NEXT_PUBLIC_RECAPTCHA_SITE_KEY
  value: "<the same site key from step 3>"
  availability: [BUILD, RUNTIME]
- variable: APP_CHECK_ENFORCE
  value: "true"
  availability: [RUNTIME]
```

The site key is a **public** credential by design (it's baked into the client bundle) — safe to commit, like the `NEXT_PUBLIC_FIREBASE_*` vars already in the file.

### 7. Kill Switch

If something breaks in production (false positives blocking real users, debug-token issues, etc.), flip the kill switch:

1. Edit `apphosting.yaml`: change `APP_CHECK_ENFORCE` from `"true"` to `"false"`.
2. Commit and push to the live branch.
3. App Hosting redeploys (~3–5 min). Verification still runs and logs (so you can diagnose), but requests are no longer blocked.

## Development

```bash
# Install dependencies
npm install

# Run the Next.js dev server
npm run dev

# Run Firebase functions locally
npm run functions
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Firebase App Hosting Setup

The Next.js app is deployed to **Firebase App Hosting**, which builds and runs the app on Cloud Run with automatic SSR support. Deploys are triggered by pushing to the tracked branch (no `firebase deploy` for the web app).

### 1. Enable App Hosting and Create a Backend

1. Open the [Firebase Console](https://console.firebase.google.com/) → select your project → **Build** → **App Hosting**.
2. Click **Get started** (or **Create backend**) and:
   - **Region:** pick one close to your users (e.g. `us-central1`).
   - **GitHub repository:** authorize Firebase and select this repo.
   - **Live branch:** the branch App Hosting will auto-deploy from (e.g. `main`).
   - **Root directory:** `/` (the `apphosting.yaml` lives at the repo root).
   - **Backend ID:** a short name, e.g. `maktabah`.
3. Skip the "associate a domain" step for now — you can attach a custom domain after the first deploy succeeds.

### 2. Review `apphosting.yaml`

[apphosting.yaml](apphosting.yaml) controls the Cloud Run runtime and the environment variables / secrets injected into the build and the running server. It already declares:

- `runConfig`: instance sizing (`cpu`, `memoryMiB`, `minInstances`).
- `env` entries with `value:` for the public `NEXT_PUBLIC_*` config (available at BUILD and RUNTIME so Next.js can inline them).
- `env` entries with `secret:` for server-only secrets (`OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) — these reference Google Secret Manager and are only available at RUNTIME.

Update the `NEXT_PUBLIC_*` values to match your Firebase project before deploying.

### 3. Create the Secrets in Google Secret Manager

App Hosting reads secrets via Secret Manager (not via `firebase functions:secrets:set` — that's for Cloud Functions only). Use the Firebase CLI helper, which creates the secret and grants access to the App Hosting service account in one step:

```bash
# Run from the repo root. You'll be prompted for the value.
firebase apphosting:secrets:set OPENSEARCH_URL
firebase apphosting:secrets:set AWS_ACCESS_KEY_ID
firebase apphosting:secrets:set AWS_SECRET_ACCESS_KEY
```

Use the **same** `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` from the `maktabah-functions` IAM user created in step 3 of the OpenSearch setup.

If a secret already exists (e.g. you created it earlier for Cloud Functions), grant App Hosting access to it instead:

```bash
firebase apphosting:secrets:grantaccess OPENSEARCH_URL --backend maktabah
firebase apphosting:secrets:grantaccess AWS_ACCESS_KEY_ID --backend maktabah
firebase apphosting:secrets:grantaccess AWS_SECRET_ACCESS_KEY --backend maktabah
```

### 4. Deploy

App Hosting deploys automatically on push to the live branch:

```bash
git push origin main
```

Watch the rollout in **Firebase Console → App Hosting → your backend → Rollouts**. The first build takes a few minutes; subsequent builds reuse cached layers.

To trigger a deploy manually (e.g. to redeploy without a new commit), use **Create rollout** in the console, or:

```bash
firebase apphosting:rollouts:create maktabah
```

### 5. (Optional) Attach a Custom Domain

In **App Hosting → your backend → Settings → Domains**, add your domain and follow the DNS verification steps. Update `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_MCP_URL` in `apphosting.yaml` to match, then push to trigger a rebuild.

## Deploying the MCP Cloud Function

The MCP server runs as a separate Firebase Cloud Function (not on App Hosting):

```bash
npm run deploy:mcp
```

This deploys only the `mcpServer` function. Its secrets (`OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) are managed via `firebase functions:secrets:set` as described in step 7 of the OpenSearch setup.

## Project Structure

```
maktabah-next/
  app/              # Next.js app (pages, components)
  lib/              # Shared libraries (OpenSearch client)
  functions/        # Firebase Cloud Functions (search API)
  quran_loader/     # Scripts to load data into OpenSearch
  types/            # TypeScript type definitions
```

## Security Best Practices

1. Firebase Functions authenticate to OpenSearch via SigV4 using a dedicated IAM user (`maktabah-functions`) — no long-lived master passwords in the request path.
2. Keep the IAM policy narrowly scoped (`es:ESHttp*` on the domain ARN, `bedrock:InvokeModel` on the specific model). Avoid managed policies like `AmazonBedrockFullAccess`.
3. Rotate the IAM user's access keys periodically — run `firebase functions:secrets:set` and redeploy.
4. Reserve the OpenSearch master user for admin tasks (Dashboards login, role mapping); don't use it for application traffic.
5. For production, use VPC access instead of public access on the OpenSearch domain.
6. Never commit credentials to your source code repository.
