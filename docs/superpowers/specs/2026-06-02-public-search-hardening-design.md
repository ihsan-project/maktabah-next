# Public Search API Hardening — Design

**Date:** 2026-06-02
**Status:** Approved (design); pending implementation plan

## Goal

Add per-IP rate limiting (30 req/min, Firestore-backed) and input validation caps (query length, page size, pagination depth) to `/api/search`, so the endpoint can be safely public-facing without abuse driving cost or saturating OpenSearch. Reuses the existing rate-limit pattern from [`functions/lib/api-key-auth.js`](../../../functions/lib/api-key-auth.js) so the project has one rate-limit story, not two. Matches the existing `requireAppCheck` / `requireUser` per-route helper pattern.

This is the first of two specs implementing the "rest of the public-search analysis" work. The companion spec ("crawler hygiene + ops safety") covers `robots.txt`, `noindex` headers, `minInstances`, and billing alerts. A third potential spec (hot-query cache) is deferred until traffic data justifies it.

## Context

The prior spec [`2026-05-30-app-check-design.md`](2026-05-30-app-check-design.md) closed the unauthenticated-API hole on `/api/search` and `/api/storage/[...path]`. App Check is now live in production (currently `APP_CHECK_ENFORCE=false` for soft-rollout; hard-enforce flip pending).

App Check alone is not enough for going fully public:
- A determined attacker who keeps an attested browser session open can still hit the route as fast as their network allows.
- Real users can typo a 10MB JSON paste into the search box and accidentally drive a huge Bedrock embedding call.
- Without pagination caps, a scraper can walk through the entire corpus via `&page=1...10000`.

The existing MCP API at [`functions/lib/api-key-auth.js`](../../../functions/lib/api-key-auth.js) already does Firestore-transaction-based sliding-window rate limiting at 30 req/min per API key. This spec generalizes that pattern to per-IP for `/api/search`.

## Non-goals

- **Mode tiering** (anonymous → text only; auth → all modes). Decided against during brainstorming — keep all modes public; rely on App Check + rate limit as defense. Documented for posterity in case we revisit.
- **Remote Config kill switch** for hybrid/semantic modes. Was tied to mode tiering as an emergency lever; without tiering it's overengineering. Easy to add later as an env-var-gated flag if a cost incident makes it necessary.
- **Per-route rate-limit configuration UI / dashboard.** YAGNI — one route, one limit.
- **`X-RateLimit-*` headers** (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on success responses. The MCP API includes them because programmatic clients consume them; the web search route's only caller is the UI which doesn't surface this. (We DO include `Retry-After` on 429 responses — that's the RFC-standard rate-limit signal that browsers and curl already know how to handle.)
- **Rate limiting on `/api/storage`.** That route's responses are cacheable with the existing `Cache-Control: s-maxage=31536000, immutable` header, so repeated calls hit CDN, not Firebase. Not a cost driver.
- **A `withProtection` higher-order wrapper or middleware-based design.** Per-route helpers match the existing codebase pattern (`requireAppCheck`, `requireUser`). Middleware would re-encounter the Edge/Node mismatch we hit during the App Check work (Firebase Admin SDK doesn't run on the Next.js Edge runtime).
- **Worktree isolation.** Small enough scope to land on a feature branch directly.

## Architecture

```
GET /api/search?q=...&page=...&size=...&mode=...
 │
 ├─ requireAppCheck(req)                          ◄ existing
 │
 ├─ requireRateLimit(req, {                       ◄ NEW (lib/server/rate-limit.ts)
 │    bucket: 'search', limit: 30, windowMs: 60_000,
 │  })
 │    │
 │    ├─ extract client IP from x-forwarded-for header (Cloud Run sets this)
 │    ├─ hash IP (SHA-256) → stable key, no raw IPs in Firestore
 │    ├─ doc path: rateLimits/{bucket}_{minuteKey}/ips/{ipHash}
 │    ├─ Firestore transaction: get count, throw if ≥ limit, else increment
 │    ├─ on Firestore error: log warn, fail open (return)
 │    └─ throw RateLimitError(429, 'Too many requests', { retryAfterSec })
 │
 ├─ params = parseSearchParams(req.nextUrl.searchParams)
 │                                                ◄ NEW (lib/server/search-params.ts)
 │    │
 │    ├─ validates q present, q.length ≤ 200, size ∈ [1,25], page ∈ [1,50]
 │    ├─ validates mode ∈ {text, semantic, hybrid}
 │    └─ throws BadRequestError(400, '<param>: <reason>') on first violation
 │       returns typed SearchParams object on success
 │
 └─ searchDocuments(params.q, { ... })            ◄ existing
```

**Why this shape**

- Same throw-and-handle pattern the route already uses for `AppCheckError`. The route's top-level `try/catch` grows by two `instanceof` branches.
- `requireRateLimit` is generic (takes bucket name + limit + window). If we ever rate-limit another route, just reuse it with a different bucket — no copy-paste.
- `parseSearchParams` collapses the existing scattered `parseInt` / `Math.min` / `Math.max` calls in [`app/api/search/route.ts:10-17`](../../../app/api/search/route.ts) into one place that also enforces the new caps. Route logic gets clearer.
- **Fail-open on Firestore errors** matches "don't punish users for our infra." App Check fails closed because that's a security control; rate limiting is a cost control where availability matters more than enforcement perfection.

**Doc path choice — `rateLimits/{bucket}_{minuteKey}/ips/{ipHash}`**

- Top-level doc `rateLimits/search_29230015` (number = floored Unix minute) holds a subcollection `ips` keyed by hashed IP.
- Each ip subdoc has just `{ count: number }`.
- TTL on `rateLimits/*` parent docs cleans them up after ~5 min (Firestore TTL setting in the console).
- Avoids the MCP pattern of nesting under `apiKeys/{hash}/` — there's no per-API-key parent for IP-based limits.

## Module Layout

| File | Role | New / Modified |
|---|---|---|
| `lib/server/rate-limit.ts` | `requireRateLimit(req, opts)` + `RateLimitError`. Generic helper; takes bucket name, limit, window, and `Request`. Hashes IP from `x-forwarded-for`. Firestore-backed sliding window per minute. Fail-open on infra error. | New |
| `lib/server/search-params.ts` | `parseSearchParams(searchParams)` + `BadRequestError` + `SearchParams` type. Returns validated, typed object. | New |
| [`app/api/search/route.ts`](../../../app/api/search/route.ts) | Add `requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 })` after `requireAppCheck`. Replace inline param parsing with `parseSearchParams(searchParams)`. Add `RateLimitError` and `BadRequestError` branches to the existing catch block. | Modified |
| [`firestore.rules`](../../../firestore.rules) | Add a rule denying ALL client reads/writes to the `rateLimits/{any}/**` path. The collection is server-only (Admin SDK bypasses rules) — this is hardening so no client can ever scrape rate-limit data. | Modified |
| [`README.md`](../../../README.md) | Append a brief "Rate Limiting" subsection under the existing search-related section explaining the 30/min limit and how to tune it. | Modified |
| [`.claude/skills/api/SKILL.md`](../../../.claude/skills/api/SKILL.md) | Add a `requireRateLimit` row to the Auth Helpers section so future agents know to consider it. Add "Rate limit?" to the Required Decisions checklist. | Modified |

**Module contracts** (so callers don't need to read internals):

```typescript
// lib/server/rate-limit.ts
export class RateLimitError extends Error {
  statusCode: 429;
  retryAfterSec: number;
}

export interface RateLimitOpts {
  bucket: string;        // e.g. 'search' — namespaces counters across routes
  limit: number;         // requests allowed per window
  windowMs: number;      // window length in ms (60_000 = 1 minute)
}

export async function requireRateLimit(req: NextRequest, opts: RateLimitOpts): Promise<void>;
// Throws RateLimitError(429) when limit exceeded.
// Logs and returns (fail-open) on Firestore failure.
```

```typescript
// lib/server/search-params.ts
export class BadRequestError extends Error {
  statusCode: 400;
}

export interface SearchParams {
  q: string;             // 1..200 chars
  page: number;          // 1..50
  size: number;          // 1..25
  mode: 'text' | 'semantic' | 'hybrid';
  author: string | null;
  chapter: string | null;
  titles: string[];      // possibly empty
  debug: boolean;
}

export function parseSearchParams(searchParams: URLSearchParams): SearchParams;
// Throws BadRequestError(400, '<param>: <reason>') on first violation.
```

## Request Contract

**Happy-path flow:**
1. `requireAppCheck(req)` — verifies token (already wired)
2. `requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 })` — increments counter for this IP+minute
3. `parseSearchParams(req.nextUrl.searchParams)` — validates & types the params
4. `searchDocuments(params.q, { ... })` — existing logic, called with typed object
5. Return JSON

**Error responses:**

| Condition | Status | Body | Headers |
|---|---|---|---|
| Rate limit exceeded | 429 | `{"error":"Too many requests"}` | `Retry-After: <seconds>` |
| Query missing | 400 | `{"error":"q: required"}` | — |
| Query > 200 chars | 400 | `{"error":"q: must be ≤ 200 characters"}` | — |
| size > 25 or < 1 | 400 | `{"error":"size: must be 1..25"}` | — |
| page > 50 or < 1 | 400 | `{"error":"page: must be 1..50"}` | — |
| Invalid mode | 400 | `{"error":"mode: must be one of text, semantic, hybrid"}` | — |
| Firestore rate-limit infra error | (request proceeds — fail open) | — | — |
| App Check failure (existing) | 401 | `{"error":"AppCheck required"}` | — |

**IP extraction:**
```typescript
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();   // leftmost = original client per RFC 7239
  return req.headers.get('x-real-ip') || 'unknown';
}
```
- Cloud Run sets `x-forwarded-for` with the client IP first, then any proxies. Leftmost is correct.
- `'unknown'` fallback means callers without a discoverable IP all share one bucket. Acceptable; this is rare (health checks, internal probes).

## Edge Cases

| Case | Behavior |
|---|---|
| Many users behind one NAT (e.g., school network) | All share 30/min/IP. Worst case: 30 simultaneous active searchers from one IP exhaust the bucket. Real but rare. Tune up to 60/min if observed. |
| IPv6 client with rotating addresses | Each address gets its own bucket. Not a meaningful concern at this cost ceiling. |
| Same client, multiple in-flight requests in the same 100ms window | Firestore transaction serializes. The 2nd/3rd may see slightly stale read but the increment is atomic, so the final count is correct. |
| Firestore unavailable | Fail open — log a `console.warn`, return without throwing. Real-user requests still succeed. The warn log gives us monitoring visibility. |
| Clock skew between Cloud Run instances | Window key is server-side `Math.floor(Date.now() / windowMs)`. Different instances may compute slightly different bucket keys near a window boundary — at most milliseconds of skew. Negligible. |
| TTL not yet configured on Firestore | Counters accumulate. ~30 docs/minute × 1440 min/day = ~43K docs/day max, tiny storage cost. The plan instructs the dev to set TTL but the system functions either way. |

## Setup Steps That Require Manual Action

1. **Configure Firestore TTL policy** in the Firebase Console:
   - Firestore → TTL policies → Add policy
   - Collection group: `rateLimits` (root collection where per-minute buckets live)
   - Field: `expiresAt`
   - The helper writes `expiresAt: Timestamp.fromMillis(now + 5*60_000)` on every bucket doc so Firestore auto-deletes stale buckets.

That's the only manual step. No new env vars, no console toggles, no new GCP API enables.

## Kill Switch & Rollback

There's no kill switch for rate limiting (you cannot disable it without a deploy). However:

- **Failing open by design** means a Firestore outage doesn't take the site down — it just temporarily drops rate-limit enforcement.
- **Per-bucket config** means raising the limit (e.g., 30 → 100) is a one-line change in the route handler + deploy. ~3–5 min via App Hosting.
- **Removing rate-limit entirely** is a one-commit revert of the route changes; App Hosting deploys it on push.

If you want an env-var kill switch (`RATE_LIMIT_ENFORCE=false`) for parity with the App Check helper, add it to the plan; it's ~3 extra lines in `requireRateLimit`. The spec doesn't include it by default — the App Check kill switch exists because App Check rejected legitimate users during early rollout; rate limiting at 30/min has no plausible false-positive scenario for real browsers.

## Testing Strategy

Verification-driven, matching the repo convention (no test framework). Each task verifies with `npx tsc --noEmit`, `npm run dev` + `curl`, and live-deploy smoke checks.

- **Unit-like verification** of `parseSearchParams`: run via a temporary script that imports it and exercises each error path (curl-based or a Node REPL one-liner). Removed after verification.
- **Rate-limit verification** in dev: hit `/api/search` 31 times in a minute with the same App Check token, confirm 30 succeed and the 31st returns 429 with `Retry-After`. Confirm next minute the counter resets.
- **Fail-open verification**: temporarily break the Firestore connection (e.g., set `FIRESTORE_EMULATOR_HOST=localhost:9999`) and confirm `/api/search` still returns results, with a `console.warn` in the dev server log.
- **Input-cap verification**: send queries that violate each cap, confirm the right 400 with the right error message.
- **Production smoke** after deploy: hit `/api/search` from a real browser (rate-limited path) and from `curl` (no App Check → 401 path); confirm both behave correctly.

## Open Risks

- **Rate-limit cost ramp at high scale.** At 1M req/day this adds ~$2.40/day in Firestore. Tracked; mitigate with Upstash Redis if and only if traffic exceeds ~100K req/day. Not pre-optimizing.
- **NAT'd shared-IP populations** (schools, large workplaces) all share one bucket. Acceptable risk; raising the limit to 60/min is a one-line tweak if observed.
- **Per-instance Cloud Run clock skew.** Cloud Run instances may have slightly different system clocks. The Firestore transaction is the source of truth (count is atomic), so the only effect is which minute-bucket a request falls into near a boundary — at most milliseconds of misalignment.
- **Firestore TTL policy not set** on initial deploy means counters accumulate until TTL is configured. Storage cost is negligible (~43K tiny docs/day). The plan calls this out as a post-deploy step.

## Out-of-Scope Follow-ups (Companion Specs / Tickets)

Tracked separately per the original public-search analysis decomposition:

- **Spec 2 (next):** Crawler controls + ops safety — `robots.txt`, `X-Robots-Tag: noindex` on `/api/*` and `/search`, `minInstances: 1` in `apphosting.yaml`, billing alerts in GCP + AWS Cost Anomaly Detection.
- **Spec 3 (deferred):** Hot-query LRU cache for `/api/search`. Revisit when production traffic data shows enough cache-hit potential to justify the implementation cost.
- **Remote Config kill switch** for expensive modes — only if a cost incident makes it necessary; not worth the new infrastructure preemptively.
- **`/api/storage` rate limiting** — only if observed abuse occurs; CDN caching makes it a non-issue today.
