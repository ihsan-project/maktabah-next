---
name: api developer
description: Updates the Next.js API routes and the MCP Cloud Function. Use when backend changes are needed — new endpoints, modifications to existing endpoints, or updates to the MCP server — to support the frontend and business needs.
---

## Architecture Overview

This app runs on **Firebase App Hosting** (Cloud Run-backed) with **server-side rendering**. The primary API surface is **Next.js Route Handlers** in `app/api/*/route.ts` (Node runtime). A single **Cloud Function** (`functions/index.js` → `mcpServer`) hosts the MCP server for external programmatic clients.

- App Hosting auto-deploys on push to `main`. No `firebase deploy` for Next.js code.
- Secrets are declared in `apphosting.yaml` either as plain `value:` entries (public config) or `secret:` references to Secret Manager (private).
- The MCP function is deployed separately via `firebase deploy --only functions:mcpServer`.

## Current Next.js API Routes

| Path | File | Auth | Purpose |
|---|---|---|---|
| `GET /api/search` | `app/api/search/route.ts` | **App Check** (`requireAppCheck`) | OpenSearch + Bedrock embeddings query |
| `GET /api/storage/[...path]` | `app/api/storage/[...path]/route.ts` | **App Check** (`requireAppCheck`) | Proxy JSON files from Firebase Storage |
| `GET/POST /api/keys` | `app/api/keys/route.ts` | **User** (`requireUser`) | List + create API keys |
| `DELETE /api/keys/[keyId]` | `app/api/keys/[keyId]/route.ts` | **User** | Revoke an API key |
| `GET /api/keys/[keyId]/usage` | `app/api/keys/[keyId]/usage/route.ts` | **User** | Per-key usage stats |

## Current Cloud Functions

| Function | File | Auth | Purpose |
|---|---|---|---|
| `mcpServer` | `functions/index.js` | API key (per-key, rate-limited) | MCP server reached on apex at `/mcp` via Next.js rewrite. Designed for programmatic external clients (Claude, Cursor, etc.). App Check does NOT apply — these are not browser-attested calls. |

## Auth Helpers

All three helpers live under `lib/server/` and follow the same shape: throw a typed error on failure, let the route handler map to a JSON 4xx.

- **`requireAppCheck(req)`** ([`lib/server/app-check.ts`](../../../lib/server/app-check.ts)) — Verifies the `X-Firebase-AppCheck` JWT. Gated by `APP_CHECK_ENFORCE` env var (kill switch). Use for routes that should only accept calls from a real instance of the web app. Default for any new route that hits a paid external service or could be abused at scale.

- **`requireUser(req)`** ([`lib/server/api-keys.ts`](../../../lib/server/api-keys.ts)) — Verifies the Firebase ID token from the `Authorization: Bearer …` header and returns the caller's `uid`. Use for routes that read or write per-user data.

- **`requireRateLimit(req, opts)`** ([`lib/server/rate-limit.ts`](../../../lib/server/rate-limit.ts)) — Per-IP sliding-window rate limit, backed by Firestore. Takes `{ bucket, limit, windowMs }`. Fails open on Firestore errors (a cost control, not a security control — availability matters more than perfect enforcement). Returns `429` with a `Retry-After` header when exceeded.

All three helpers can stack — call `requireAppCheck` first, then `requireRateLimit`, then `requireUser`, for a route that needs all three.

## Required Decisions Before Adding Any New API Route

**Before writing route code, walk the developer through these four questions and record their answers:**

1. **Auth model.** Pick one:
   - **App Check only** (`await requireAppCheck(req);`) — public read, bot-resistant. Default for routes that hit paid external services.
   - **User auth only** (`await requireUser(req);`) — per-user data (bookmarks, key management).
   - **Both** — per-user writes that also need App Check enforcement.
   - **Neither** — only justified for genuinely public, cheap, non-abusable endpoints. Push back if the dev picks this without a clear reason.
2. **Cost profile.** Does the route call a paid external service (OpenSearch, Bedrock, third-party API, expensive Firestore reads)? If yes, App Check is the default unless there's a specific reason not to.
3. **Caller location.** Browser only? SSR/Server Component? Both? App Check tokens are browser-only — if SSR needs the data, prefer importing the function directly into the Server Component over calling the route via HTTP.
4. **Rate limit needed?** If yes, add `await requireRateLimit(req, { bucket: '<route-name>', limit: <N>, windowMs: 60_000 });` after `requireAppCheck`. Pick a `bucket` name that namespaces the counter (typically the route name). Default `limit` of 30/min matches `/api/search`; tune based on expected legitimate traffic.

## Adding a New Next.js API Route

1. Create `app/api/<route>/route.ts` with:

   ```typescript
   import { NextRequest, NextResponse } from 'next/server';
   import { requireAppCheck, AppCheckError } from '@/lib/server/app-check';
   // import { requireRateLimit, RateLimitError } from '@/lib/server/rate-limit';
   // import { requireUser, AuthError, handleRouteError } from '@/lib/server/api-keys';

   export const runtime = 'nodejs';
   export const dynamic = 'force-dynamic';

   export async function GET(req: NextRequest) {
     try {
       await requireAppCheck(req);
       // await requireRateLimit(req, { bucket: '<route>', limit: 30, windowMs: 60_000 });
       // const uid = await requireUser(req); // if user auth also needed
     } catch (err) {
       if (err instanceof AppCheckError) {
         return NextResponse.json({ error: err.message }, { status: err.statusCode });
       }
       // if (err instanceof RateLimitError) {
       //   return NextResponse.json({ error: err.message }, {
       //     status: err.statusCode,
       //     headers: { 'Retry-After': String(err.retryAfterSec) },
       //   });
       // }
       throw err;
     }

     // ... route logic ...
   }
   ```

2. Client-side, fetch the route through [`lib/appCheckFetch.ts`](../../../lib/appCheckFetch.ts) instead of native `fetch` so the App Check header is attached automatically.

3. If the route needs secrets (e.g. external API credentials), add them to `apphosting.yaml` as `secret:` refs to Secret Manager — never inline values.

4. No CORS boilerplate. Same-origin from the Next.js app; cross-origin clients should use the MCP server.

## Modifying the MCP Cloud Function

- Code lives in `functions/index.js` and `functions/mcp/`.
- Deploy: `firebase deploy --only functions:mcpServer`.
- Auth is per-API-key with rate limiting in `functions/lib/api-key-auth.js`. Do not add App Check — clients are programmatic, not browsers.
- Secrets are declared in the function `onRequest` options (e.g. `secrets: ['OPENSEARCH_URL', ...]`).

## Deployment

```bash
git push origin main          # Triggers App Hosting auto-deploy for Next.js
firebase deploy --only functions:mcpServer   # MCP function only
```

## Key Services

- **Firebase Auth** — Google Sign-in (client + Admin SDK verification).
- **Firestore** — User bookmarks, notes, API keys, usage tracking.
- **Firebase Storage** — Content files; access only via the `/api/storage` route.
- **OpenSearch** (AWS managed) — Full-text + KNN search with Arabic analyzer.
- **AWS Bedrock** (Cohere Embed Multilingual v3) — Query embeddings for semantic/hybrid search.
- **Firebase App Check + reCAPTCHA Enterprise** — Attestation for `/api/search` and `/api/storage`.
