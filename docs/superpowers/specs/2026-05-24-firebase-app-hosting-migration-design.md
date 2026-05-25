# Firebase App Hosting Migration — Design

**Date:** 2026-05-24
**Status:** Approved (design); pending implementation plan

## Goal

Move the Maktabah Next.js app from **static export (`output: 'export'`) on Firebase Hosting + Cloud Functions** to **server-side rendering on Firebase App Hosting (Cloud Run)**, fold the HTTP/callable Cloud Functions into Next.js API route handlers, and convert SEO-valuable pages to SSR. The MCP server is the only function that stays a Cloud Function.

## Current Architecture (baseline)

- **Next.js 14**, `output: 'export'` → static HTML/JS served by Firebase Hosting as a SPA.
- **Cloud Functions** (`functions/`, gen 2):
  - `nextApiHandler` (`onRequest`) — handles `/api/search`, calls `searchDocuments` (OpenSearch). Secrets: `OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
  - `mcpServer` (`onRequest`) — MCP server at `/mcp` for external clients (Claude, Cursor, etc.) via `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport` (stateless). Same secrets.
  - `proxyStorage` (`onRequest`) — `/api/storage/**`, proxies JSON files from the `maktabah-8ac04.firebasestorage.app` bucket.
  - `generateApiKey`, `revokeApiKey`, `listApiKeys`, `getApiKeyUsage` (`onCall` callable) — API-key management using Firebase Auth context (`request.auth`).
- **Routing** (`firebase.json` hosting rewrites): `/mcp` → `mcpServer`, `/api/storage/**` → `proxyStorage`, `/api/**` → `nextApiHandler`, `**` → `/index.html` (SPA fallback).
- **Frontend data fetching:** search via `fetch('/api/search')` (emulator URL in dev); API-key management via `httpsCallable`; Quran/word/lexicon data via static JSON in `public/`; verses via `proxyStorage` (`lib/fetchVerse.ts`).
- **Secrets:** `OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` are server-side only (Secret Manager, via functions). `NEXT_PUBLIC_FIREBASE_*` are public Firebase web config (safe). `NEXT_PUBLIC_MIXPANEL_TOKEN` is public by design.

## Target Architecture

- **Firebase App Hosting** runs the Next.js server (SSR + API routes) on Cloud Run.
- **`mcpServer` stays a Cloud Function**, reached on the apex domain at `/mcp` via a Next.js rewrite proxy.
- All other functions become Next.js API route handlers.

### Function → route mapping

| Today (Cloud Function) | After |
|---|---|
| `nextApiHandler` (`/api/search`) | `app/api/search/route.ts` |
| `proxyStorage` (`/api/storage/**`) | `app/api/storage/[...path]/route.ts` |
| `generateApiKey` / `listApiKeys` (callable) | `app/api/keys/route.ts` (POST / GET) |
| `revokeApiKey` (callable) | `app/api/keys/[keyId]/route.ts` (DELETE) |
| `getApiKeyUsage` (callable) | `app/api/keys/[keyId]/usage/route.ts` (GET) |
| `mcpServer` (`/mcp`) | **unchanged Cloud Function**, via Next.js rewrite |

## Key Decisions

1. **MCP server:** Keep as a standalone Cloud Function (lowest risk for external consumers; MCP SDK streaming stays on proven infra).
2. **Auth functions:** Convert all 4 callable functions to Next.js API routes; verify Firebase ID token server-side via `admin.auth().verifyIdToken()`.
3. **SSR scope:** SSR/SSG the SEO-valuable public pages; keep auth-gated/interactive pages as client islands.
4. **Key hiding:** No new work beyond ensuring OpenSearch/AWS secrets live only in server-side route handlers (via App Hosting secret refs). Firebase web config stays public.
5. **Deploy model:** GitHub auto-deploy on push for App Hosting; `mcpServer` deployed separately via `firebase deploy --only functions`.
6. **MCP routing:** Next.js `rewrites()` proxy at `/mcp` → mcpServer function URL (keeps existing public path on apex domain). Documented fallback: dedicated subdomain if streaming proxy proves problematic.

## Shared Backend Code

The MCP function and the new Next.js routes both need: search logic (`functions/lib/search-core.js`), API-key hashing (`functions/lib/api-key-auth.js`), and usage data (`functions/lib/usage-tracking.js`).

**Decision:** Port that logic to clean TypeScript modules under `lib/server/` for the Next.js app, and **leave `functions/` completely untouched** so the MCP function stays isolated. Accept ~350 lines of search-code duplication (YAGNI) rather than extracting a shared workspace package (which would touch MCP and complicate the App Hosting build). Both copies hit the same OpenSearch/Firestore, so behavior stays consistent.

New server-side modules:

- `lib/server/firebase-admin.ts` — initialize `firebase-admin`. Production: Application Default Credentials (App Hosting Cloud Run service account). Local dev: point admin at the Auth + Firestore emulators (`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`).
- `lib/server/search.ts` — port of `search-core.js`: OpenSearch client (AWS SigV4), Bedrock embeddings, `searchDocuments` (text/semantic/hybrid), `reciprocalRankFusion`, `deduplicateResults`, `fetchHighlights`. Preserve `OPENSEARCH_INDEX = 'kitaab'` and `AWS_REGION` default `us-east-1`.
- `lib/server/api-keys.ts` — `hashApiKey`, `generateRawApiKey`, and a `requireUser(req)` helper that verifies the Bearer ID token and returns the uid.
- `lib/server/usage.ts` — `getUsageData(keyHash, days)`.

## Authentication Change (callable → route)

- Each key-management route reads `Authorization: Bearer <Firebase ID token>` and calls `admin.auth().verifyIdToken()` to get the uid. Authorization logic (max 5 active keys, ownership checks, revoke/usage rules) is preserved exactly from the current callable implementations.
- Frontend `lib/api-keys.ts` changes from `httpsCallable` to `fetch`, attaching `await auth.currentUser.getIdToken()` as the Bearer header.
- `firebaseConfig.ts` drops the Functions SDK (`getFunctions`, `connectFunctionsEmulator`). `auth` and `db` remain for client-side Auth/Firestore.

### Route contracts (preserve existing response shapes)

- `POST /api/keys` — body `{ name }`. Returns `{ key, keyId, name, keyPrefix }`. Enforces max 5 active keys, name required, ≤100 chars.
- `GET /api/keys` — returns `{ keys: ApiKey[] }` ordered by `createdAt` desc.
- `DELETE /api/keys/[keyId]` — returns `{ success: true }`. Verifies ownership; rejects already-revoked.
- `GET /api/keys/[keyId]/usage?days=N` — returns `{ keyId, requestCount, lastUsedAt, rateLimit, usage }`. `days` clamped 1–10. Verifies ownership.
- `GET /api/search?q=&page=&size=&mode=&author=&chapter=&title=&debug=` — same query contract as today; strips `source` from results unless `debug=true`.
- `GET /api/storage/[...path]` — downloads `{path}` from the bucket, returns JSON with `Cache-Control: public, max-age=3600`; 404 if missing.

## SSR Page Conversions

- **`/story/[name]`** (`app/story/[name]/page.tsx`) — already a server component with `generateMetadata` + `generateStaticParams`. Remove static-export-only constraints; becomes SSG/SSR. Keep `StoryClient` island for auth-aware UI.
- **`/stories`** (`app/stories/page.tsx`) — convert from `'use client'` to a server component rendering the story list server-side for SEO; any interactive bits become a small client island.
- **Home `/`** (`app/page.tsx`) — SSR shell renders `HomeContent` for crawlers; move the "redirect logged-in users to `/search`" effect into a tiny client island.
- **`/developers`** (`app/developers/page.tsx`) — split into **public SSR docs** (MCP server endpoint, config snippet, available tools, recommended system prompt) + an **auth-gated client island** for the API-keys table (the `ProtectedRoute` portion). Update `MCP_SERVER_URL`/`NEXT_PUBLIC_MCP_URL` to the apex `/mcp` path.
- **`/quran`** (`app/quran/page.tsx`) — already a server wrapper + client island with metadata/JSON-LD; keep as-is.
- **`/bookmarks`, live `/search` results** — stay client (personalized/dynamic, low SEO value). The `/search` page keeps its client interactivity but drops the hardcoded emulator URL branch.

## Config Changes

- **`next.config.js`**: remove `output: 'export'`; remove `images.unoptimized`; add `async rewrites()` mapping `/mcp` → the `mcpServer` function URL. Keep `remotePatterns`, `forceSwcTransforms`, `reactStrictMode`.
- **`apphosting.yaml`**:
  - `env` (availability `BUILD` + `RUNTIME`, `value:`) — `NEXT_PUBLIC_FIREBASE_*`, `NEXT_PUBLIC_MIXPANEL_TOKEN`, `NEXT_PUBLIC_MCP_URL`, `NEXT_PUBLIC_SITE_URL` (`https://maktabah.app`).
  - `env` (availability `RUNTIME`, `secret:`) — `OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (reuse existing Secret Manager secrets). Optional `OPENSEARCH_INDEX`, `AWS_REGION`.
- **`firebase.json`**: remove the `hosting` rewrites to functions and the SPA fallback (remove the `hosting` block, or reduce it). Keep `functions` (for `mcpServer`), `firestore`, `storage`, `emulators`.
- **`functions/index.js`**: remove all exports except `mcpServer`. Shared libs (`search-core.js`, `api-key-auth.js`, `usage-tracking.js`, `storage-cache.js`) stay for MCP.
- **Frontend cleanup**: `app/search/page.tsx` and `lib/fetchVerse.ts` drop the hardcoded `http://127.0.0.1:5001/...` emulator branches (relative `/api/...` works under `next dev`).
- **Build scripts** (`package.json`): the `build:firebase` / `deploy*` scripts that copy `.next` into `functions/` are obsolete for App Hosting; replace with App Hosting build (`next build`) + standalone `firebase deploy --only functions` for MCP. Keep `prebuild` sitemap generation.

## Deployment & Secrets

- Connect the GitHub repo to Firebase App Hosting; pushes to the production branch trigger build + rollout on Cloud Run.
- Grant the App Hosting backend service account **Secret Manager Secret Accessor** on `OPENSEARCH_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Deploy `mcpServer` separately via `firebase deploy --only functions`.

## Phasing

1. **Phase 1 — Foundation & config:** remove `output: 'export'` + `images.unoptimized`; add `/mcp` rewrite; create `lib/server/firebase-admin.ts`; configure `apphosting.yaml`; update `firebase.json`.
2. **Phase 2 — Port backend to API routes:** `lib/server/search.ts`, `app/api/search/route.ts`, `app/api/storage/[...path]/route.ts`, `lib/server/api-keys.ts` + `lib/server/usage.ts`, the 4 key routes; update `lib/api-keys.ts`, `firebaseConfig.ts`, and frontend emulator branches; slim `functions/index.js`.
3. **Phase 3 — SSR pages:** home shell + client island, `/stories` server component, `/story/[name]` cleanup, `/developers` docs/auth split.
4. **Phase 4 — Deploy & cutover:** connect GitHub auto-deploy; grant secret access; deploy `mcpServer`; verify `/mcp` proxy, search, key ops, SSR rendering; remove obsolete build/deploy scripts.

## Verification

- `/mcp` rewrite proxy works with the MCP streaming transport end-to-end (fallback: dedicated subdomain + `NEXT_PUBLIC_MCP_URL` update if not).
- Search, storage proxy, and all 4 key operations work against the deployed App Hosting backend.
- SSR pages return server-rendered content (view-source shows content) with correct metadata/JSON-LD.
- OpenSearch/AWS secrets never appear in the client bundle.

## Out of Scope (noted)

- `serviceAccount.json` is committed at the repo root — a real credential. Recommend gitignoring + rotating. Touched only as needed for local admin dev setup unless separately prioritized.
