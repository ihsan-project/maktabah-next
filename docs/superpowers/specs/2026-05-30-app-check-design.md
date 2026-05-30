# Firebase App Check on Public API Routes — Design

**Date:** 2026-05-30
**Status:** Approved (design); pending implementation plan

## Goal

Close the unauthenticated-API hole on the two Next.js Route Handlers that today are publicly callable: `/api/search` and `/api/storage/[...path]`. Use Firebase App Check with reCAPTCHA Enterprise to require that requests originate from a real, attested instance of the Maktabah web app. Hard-enforce from day one, with an environment-variable kill switch (`APP_CHECK_ENFORCE=false`) for instant rollback.

Also: bring [.claude/skills/api/SKILL.md](../../../.claude/skills/api/SKILL.md) in line with the current Firebase App Hosting / Next.js Route Handler architecture, and add a required decision checklist that forces future API additions to make an explicit App Check choice.

## Context

After the App Hosting migration (see [2026-05-24-firebase-app-hosting-migration-design.md](2026-05-24-firebase-app-hosting-migration-design.md)), the primary API surface moved from Cloud Functions to Next.js Route Handlers in `app/api/*/route.ts`. The search and storage routes are unauthenticated:

- [app/api/search/route.ts](../../../app/api/search/route.ts) — `force-dynamic`, no auth, hits AWS Bedrock (Cohere embeddings) and AWS OpenSearch.
- [app/api/storage/[...path]/route.ts](../../../app/api/storage/[...path]/route.ts) — no auth, proxies arbitrary JSON files out of the `maktabah-8ac04.firebasestorage.app` bucket.

The search page UI is gated by `ProtectedRoute` (a client-side `useAuth()` wrapper), but that gates only the React tree; the underlying HTTP endpoint is publicly callable by anyone with the URL. SSR does not hide route handlers — every `route.ts` is a public HTTP endpoint on the apex domain regardless of how the calling page is rendered.

A separate cost/abuse analysis identified that the realistic risk is not raw $ burn (marginal cost per search is ~$0.000015 in Bedrock + Cloud Run terms) but **OpenSearch cluster saturation** — sustained traffic from a single abuser can push the managed OpenSearch instance into a higher tier, plus degrade real-user latency.

`/api/keys/*` already uses the existing `requireUser(req)` helper ([lib/server/api-keys.ts](../../../lib/server/api-keys.ts)) and is not in scope. The MCP Cloud Function (`functions/index.js` → `mcpServer`) uses API-key auth designed for programmatic external clients and is not in scope.

## Non-goals

- App Check on `/api/keys/*` (already auth-gated; belt-and-suspenders not worth rollout risk).
- App Check on the MCP `mcpServer` function (programmatic API-key clients; App Check would defeat the purpose).
- Rate limiting, hot-query caching, billing alerts (recommended in the broader abuse analysis but tracked as separate follow-up work).
- Migrating or restructuring `functions/`.
- A monitor-only phase. We hard-enforce from launch; the kill switch is the safety net.

## Architecture

```
Browser
 └─ initializeApp()                            ◄─ existing, firebaseConfig.ts
     └─ initializeAppCheck(                    ◄─ NEW, firebaseConfig.ts
          ReCaptchaEnterpriseProvider(siteKey),
          { isTokenAutoRefreshEnabled: true }
        )

Client fetch to a protected route
 └─ appCheckFetch(url, init)                   ◄─ NEW, lib/appCheckFetch.ts
     ├─ getToken(appCheck) → { token }
     ├─ headers['X-Firebase-AppCheck'] = token
     └─ fetch(url, init)

Next.js Route Handler (/api/search, /api/storage/[...path])
 └─ requireAppCheck(req)                       ◄─ NEW, lib/server/app-check.ts
     ├─ if process.env.APP_CHECK_ENFORCE !== 'true' → log, return  (kill switch)
     ├─ token = req.headers.get('X-Firebase-AppCheck')
     ├─ if !token → throw AppCheckError(401, 'AppCheck required')
     ├─ await getAdminAppCheck().verifyToken(token)
     └─ throw AppCheckError(401, 'AppCheck invalid') on failure
```

**Why this shape**

- **Per-route helper, not middleware.** Mirrors the existing `requireUser(req)` pattern in [lib/server/api-keys.ts](../../../lib/server/api-keys.ts). Avoids the Next.js Edge runtime, which doesn't support `firebase-admin` (uses Node crypto + gRPC). Adds one line at the top of each protected handler; trivial to add to new routes.
- **Client wrapper, not global fetch monkey-patch.** Explicit at call sites. The seven existing call sites that hit protected routes are easy to enumerate and migrate.
- **Server-side kill switch.** A single env-var flip + redeploy disables enforcement without a code revert. Token verification still runs and is logged, so the rollback period still gives you observability.
- **Fail closed.** Any verification error — missing token, invalid token, Admin SDK throwing on a transient failure — returns 401. Never fail open.

## Module Layout

| File | Role | New / Modified |
|---|---|---|
| [firebaseConfig.ts](../../../firebaseConfig.ts) | Add `initializeAppCheck(...)` after `initializeApp(...)`. Export `appCheck` instance (or `null` if site key missing — see kill switch). Read `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `NEXT_PUBLIC_APP_CHECK_DEBUG` from env. Skip init entirely if `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is empty/unset. | Modified |
| `lib/appCheckFetch.ts` | Thin client wrapper. `appCheckFetch(input, init)`: calls `getToken(appCheck)`, merges `X-Firebase-AppCheck` header into `init.headers`, delegates to `fetch`. Browser-only (throws if called server-side). | New |
| [lib/server/firebase-admin.ts](../../../lib/server/firebase-admin.ts) | Add `getAdminAppCheck()` accessor parallel to existing `getAdminAuth()`, `getAdminDb()`, `getAdminStorage()`. | Modified |
| `lib/server/app-check.ts` | Export `requireAppCheck(req: NextRequest): Promise<void>` and `AppCheckError`. Reads `APP_CHECK_ENFORCE`. Structured-logs every verification. | New |
| [app/api/search/route.ts](../../../app/api/search/route.ts) | Add `await requireAppCheck(req);` at the top of `GET`. Add `AppCheckError` handling that returns 401 JSON. | Modified |
| [app/api/storage/[...path]/route.ts](../../../app/api/storage/[...path]/route.ts) | Same: `await requireAppCheck(req);` at top of `GET`; map `AppCheckError` → 401. | Modified |
| Call sites that fetch protected routes | Replace `fetch(...)` with `appCheckFetch(...)`. Files: [app/search/page.tsx](../../../app/search/page.tsx), [lib/fetchVerse.ts](../../../lib/fetchVerse.ts), [lib/roots.ts](../../../lib/roots.ts), [lib/lanes-lexicon.ts](../../../lib/lanes-lexicon.ts), [app/components/WordMorphologyContent.tsx](../../../app/components/WordMorphologyContent.tsx), [app/components/InteractiveArabicText.tsx](../../../app/components/InteractiveArabicText.tsx). | Modified |
| [apphosting.yaml](../../../apphosting.yaml) | Add `APP_CHECK_ENFORCE=true` and `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` env vars (the site key is the public reCAPTCHA Enterprise key — safe to embed in client bundle by design). | Modified |
| `.env.local.example` (or equivalent) | Document the new env vars for local dev. | Modified or new |
| [.claude/skills/api/SKILL.md](../../../.claude/skills/api/SKILL.md) | Full rewrite — see "SKILL.md rewrite" section below. | Modified |

## Request Contract

**Header:** `X-Firebase-AppCheck: <jwt>` — canonical name Firebase Admin SDK reads. Don't invent a new header.

**Token lifecycle:** The Firebase JS SDK fetches an App Check token on init, caches it, and auto-refreshes before expiry (default ~1 hour) when `isTokenAutoRefreshEnabled: true`. `getToken()` returns the cached token if valid, otherwise fetches a new one. Steady-state overhead per request is microseconds.

**Response codes**

| Condition | Response |
|---|---|
| `APP_CHECK_ENFORCE !== 'true'` | Continue. Log result of verification attempt. |
| Header missing, enforcement on | `401 { error: 'AppCheck required' }` |
| Token present but invalid/expired | `401 { error: 'AppCheck invalid' }` |
| Client `getToken()` throws (network, reCAPTCHA blocked) | Wrapper sends the request without the header → server returns 401. UI surfaces a clear "search unavailable; try disabling content blockers" message. |
| Client App Check not initialized (site key missing/disabled at build time) | Wrapper sends the request without the header → server returns 401 if enforcement on, or skips if enforcement off. |
| Admin SDK `verifyToken()` throws transient error | Treat as failure → 401. Do not fail open. |

**Logging:** Every verification logs `{ route, enforced: bool, result: 'pass'|'fail'|'skip', reason?: string }` to Cloud Logging via `console.log` (App Hosting captures stdout). This gives the data a monitor-mode rollout would have given, even though we hard-enforce.

## Local Development

`localhost` doesn't pass reCAPTCHA. App Check supports debug tokens for dev:

1. Developer sets `NEXT_PUBLIC_APP_CHECK_DEBUG=true` in `.env.local`.
2. `firebaseConfig.ts` reads it and sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` **before** calling `initializeAppCheck`.
3. On first page load, the browser console logs a UUID debug token.
4. Developer pastes the UUID into Firebase Console → App Check → Apps → "Manage debug tokens".
5. Subsequent local requests carry that debug token and pass `verifyToken()` on the server.

For server-side dev (App Check enforcement when running `next dev` locally), set `APP_CHECK_ENFORCE=false` in local `.env` so the verifier logs but does not block. This is the documented local-dev path.

## Kill Switch & Rollback

- **Disable enforcement:** set `APP_CHECK_ENFORCE=false` in [apphosting.yaml](../../../apphosting.yaml), redeploy. Verification still runs and logs; nothing is blocked. ~2–5 minute roll-out via App Hosting.
- **Disable client wrapper entirely** (worst case): revert the call-site changes that swapped `fetch` for `appCheckFetch`. No code change to the server is needed because the env flag already gates rejection.
- **Disable App Check init:** set `NEXT_PUBLIC_RECAPTCHA_SITE_KEY=` (empty). `firebaseConfig.ts` should skip `initializeAppCheck` when the site key is missing — design the init to be defensive.

## Setup Steps That Require Manual Action

These cannot be automated by code changes and must be done in the GCP/Firebase consoles before the implementation can land:

1. **Enable reCAPTCHA Enterprise API** in the `maktabah-8ac04` GCP project.
2. **Create a reCAPTCHA Enterprise site key** (type: Score-based, scope: production domain + any preview domains).
3. **Register the site key with Firebase App Check** in the Firebase Console under App Check → Apps → the web app → reCAPTCHA Enterprise.
4. **Generate a debug token** for the developer's local environment (Firebase Console → App Check → Apps → Manage debug tokens).
5. **Add env vars** to App Hosting backend config: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` and `APP_CHECK_ENFORCE=true`.

The implementation plan should call out which steps the developer needs to do in the console and at what point.

## SKILL.md Rewrite

The current [.claude/skills/api/SKILL.md](../../../.claude/skills/api/SKILL.md) describes the pre-App-Hosting architecture (static export, `nextApiHandler`, `proxyStorage`, `firebase.json` rewrites, CORS boilerplate). Following it as-is would lead a future agent to add new endpoints as Cloud Functions, bypassing App Check entirely. The rewrite has two parts.

### Part 1 — Bring the skill in line with reality

- **Architecture Overview:** Firebase App Hosting (Cloud Run-backed) running SSR Next.js. Primary API surface is Next.js Route Handlers in `app/api/*/route.ts` (Node runtime). Cloud Functions are reserved for the MCP server only.
- **Current Next.js API Routes** (new section): list `/api/search`, `/api/storage/[...path]`, `/api/keys`, `/api/keys/[keyId]`, `/api/keys/[keyId]/usage` with one-line descriptions and current auth model (App Check / user / both / none).
- **Current Cloud Functions** (narrowed): just `mcpServer`. Describe API-key auth model. Note App Check does not apply.
- **Adding New API Endpoints** (rewritten): create `app/api/<route>/route.ts` with `runtime = 'nodejs'`. No CORS boilerplate. No `firebase.json` rewrites for new APIs. Secrets via App Hosting `apphosting.yaml` `env:` block.
- **Deployment:** App Hosting auto-deploys from main on push. `firebase deploy --only functions` is only for the MCP server.
- **Drop:** the entire CORS section, the dev-vs-prod URL section, the static export references.

### Part 2 — Required decisions for new API routes

A new "Required decisions before adding any new API route" section that the skill explicitly instructs future agents to walk through with the developer **before writing code**. The checklist:

1. **Auth model.** Pick one:
   - **App Check only** (`await requireAppCheck(req);`) — public read, bot-resistant. Default for routes that hit paid external services.
   - **User auth only** (`await requireUser(req);`) — per-user data (bookmarks, key management).
   - **Both** — per-user writes that also need App Check enforcement.
   - **Neither** — only justified for genuinely public, cheap, non-abusable endpoints. The skill should instruct the agent to push back if the dev picks this without a clear reason.
2. **Cost profile.** Does the route call a paid external service (OpenSearch, Bedrock, third-party API, expensive Firestore reads)? If yes, App Check is the default unless there's a specific reason.
3. **Caller location.** Browser only? SSR/Server Component? Both? App Check tokens are browser-only — if SSR will call the route, it can't be App-Check-gated. (In practice, prefer importing the function directly into the Server Component rather than calling the route over HTTP.)
4. **Rate limit needed?** Yes/no flag. Out of scope for App Check work but recorded so it isn't forgotten.

The skill should require agents to surface these four questions to the developer and record the answers before generating route code.

## Testing Strategy

- **Server helper unit tests:** `requireAppCheck` with (a) `APP_CHECK_ENFORCE=false` → resolves regardless, (b) missing header → throws 401, (c) invalid token → throws 401, (d) valid token → resolves. Mock `getAdminAppCheck().verifyToken`.
- **Route integration tests:** hit `/api/search` and `/api/storage/[...path]` with and without a valid header; assert status + body.
- **Manual verification before merge:**
  1. Deploy with `APP_CHECK_ENFORCE=false`. Confirm logs show verifications happening and that all real-user flows still work (search, Quran reader, word morphology, lexicon).
  2. Flip to `APP_CHECK_ENFORCE=true`. Run the same flows. Confirm no 401s for legitimate use.
  3. From an incognito tab without App Check init (e.g., a `curl` from terminal), confirm `/api/search` and `/api/storage` return 401.
- **Post-launch monitoring:** Watch Cloud Logging for 401 rate on the two routes for 48 hours. A spike of 401s with `result: 'fail'` indicates a legitimate-user breakage; flip the kill switch and investigate.

## Open Risks

- **Ad-blockers / privacy extensions** sometimes block reCAPTCHA. The 401 path surfaces as "search unavailable" — UX copy should mention this possibility.
- **Cached service workers / stale tabs** from before this launches won't have App Check initialized and will start failing. Mitigation: the kill switch and a small client-side bump (e.g., a version query string) if it becomes an issue.
- **Debug-token sprawl:** developers accumulate debug tokens in the Firebase Console. Document a periodic cleanup as part of the SKILL.md.
- **reCAPTCHA Enterprise free tier:** 10,000 assessments/month. Each browser session typically generates one (cached for the session). At Maktabah's current scale this is comfortable, but worth tracking — billing alert recommended.

## Out-of-Scope Follow-ups (Recommended Tickets)

These came up in the broader abuse analysis and should be tracked separately:

- Per-IP rate limiting on `/api/search` (defense-in-depth beyond App Check).
- Hot-query LRU cache for the embedding + OpenSearch round-trips.
- Cap query length, page size, and pagination depth in `/api/search`.
- `robots.txt` + `X-Robots-Tag: noindex` on search routes.
- Billing alerts in GCP and AWS, plus an `apphosting.yaml` feature flag to disable expensive `mode=hybrid` searches in an emergency.
- `minInstances: 1` in `apphosting.yaml` to avoid cold-start UX.
