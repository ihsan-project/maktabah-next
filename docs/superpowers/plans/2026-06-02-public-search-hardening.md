# Public Search API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-IP rate limiting (30 req/min, Firestore-backed) and input validation caps (query ≤ 200 chars, page size ≤ 25, page ≤ 50) to `/api/search` so it can safely go public alongside Firebase App Check.

**Architecture:** Two new per-route helpers in `lib/server/` (matching the existing `requireAppCheck` / `requireUser` pattern): `requireRateLimit(req, opts)` reads `x-forwarded-for` for the client IP and uses a Firestore transaction with a 1-minute sliding window keyed by `rateLimits/{bucket}_{minuteKey}/ips/{ipHash}`. `parseSearchParams(searchParams)` collapses the existing inline `parseInt`/`Math.min` logic into one place that also enforces the new caps. Both are called at the top of the search route; both throw typed errors that map to specific status codes. Rate limiting fails open on Firestore errors (don't punish users for our infra); validation never fails open (caps are the whole point).

**Tech Stack:** Next.js 14 App Router (Node runtime), `firebase-admin/firestore` (already initialized via `lib/server/firebase-admin.ts`), TypeScript, `crypto` (built-in, for SHA-256 IP hashing).

**Testing approach:** Verification-driven (no test framework — matches the repo convention). Each task verifies with `npx tsc --noEmit`, `npm run dev` + `curl`, and an ad-hoc Node REPL script for the pure-function `parseSearchParams`. The rate-limit fail-open path is verified by temporarily pointing the dev server at a bogus Firestore emulator host.

**Spec:** [`docs/superpowers/specs/2026-06-02-public-search-hardening-design.md`](../specs/2026-06-02-public-search-hardening-design.md)

---

## Important Execution Notes (read first)

- **Branch:** Create and work on `feat/search-rate-limit` (the App Check work landed on `main` already; this should be its own PR).
- **AGENTS.md P0.5:** Never overwrite `.env.local` without asking and confirming. This plan does not introduce any new env vars, so `.env.local` should not be touched.
- **AGENTS.md P0.1:** Do not generate summary/report files when done.
- **App Check is currently soft-enforce in production** (`APP_CHECK_ENFORCE=false`). The rate-limit code calls `requireRateLimit` *after* `requireAppCheck` in the route, so the order of operations is unchanged. The kill-switch state of App Check doesn't interact with this work.
- **No new dependencies.** Everything uses `firebase-admin` (already a dependency) and Node's built-in `crypto` module.
- **MCP function and `/api/keys/*` are out of scope.** MCP has its own per-API-key rate limit in `functions/lib/api-key-auth.js`; `/api/keys/*` has `requireUser` only and doesn't need IP rate limiting.
- **`/api/storage/[...path]` is explicitly out of scope** (per spec) — its responses are CDN-cacheable via `Cache-Control: s-maxage=31536000, immutable` so abuse there hits CDN, not Firebase.
- **Production deploy** (Task 8) is deferred — the user will decide when to merge & deploy after reviewing the PR. The code is safe to deploy any time because rate limit failures are fail-open.

---

## File Structure

**Create:**
- `lib/server/rate-limit.ts` — `requireRateLimit(req, opts)` + `RateLimitError` class. Generic helper; takes bucket name, limit, window, and `NextRequest`. Hashes IP from `x-forwarded-for`. Firestore-backed sliding window per minute. Fail-open on infra error.
- `lib/server/search-params.ts` — `parseSearchParams(searchParams)` + `BadRequestError` class + `SearchParams` type. Returns a validated, typed object or throws.

**Modify:**
- [`app/api/search/route.ts`](../../../app/api/search/route.ts) — Add `requireRateLimit` call after `requireAppCheck`. Replace inline param parsing with `parseSearchParams`. Add `RateLimitError` and `BadRequestError` branches to the catch block; add `Retry-After` header on 429 responses.
- [`firestore.rules`](../../../firestore.rules) — Add a deny-all client access rule for the `rateLimits/{any}/**` path (server-only collection).
- [`README.md`](../../../README.md) — Append a "Rate Limiting" subsection (under or near the existing "Search Modes" section) describing the 30/min limit, how it's stored, and how to tune.
- [`.claude/skills/api/SKILL.md`](../../../.claude/skills/api/SKILL.md) — Add a `requireRateLimit` row to the Auth Helpers section, and add a "Rate limit needed?" item to the Required Decisions checklist.

**Manual edits the developer makes (we do not write):**
- One-time Firestore Console step in Task 7 to configure a TTL policy on the `rateLimits` collection group. The code writes the `expiresAt` field; the console configures the auto-delete policy.

---

## Task 1: Create branch and `lib/server/rate-limit.ts`

**Files:**
- Create: `/Users/mohammedislam/git/maktabah-next/lib/server/rate-limit.ts`

- [ ] **Step 1: Create the feature branch**

```bash
git checkout -b feat/search-rate-limit
```

Verify with `git status -sb` — should show `## feat/search-rate-limit`.

- [ ] **Step 2: Write the helper module**

Create `/Users/mohammedislam/git/maktabah-next/lib/server/rate-limit.ts` with this exact content:

```typescript
import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebase-admin';

export class RateLimitError extends Error {
  statusCode: 429 = 429;
  retryAfterSec: number;
  constructor(message: string, retryAfterSec: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

export interface RateLimitOpts {
  bucket: string;        // e.g. 'search' — namespaces counters across routes
  limit: number;         // requests allowed per window
  windowMs: number;      // window length in ms (60_000 = 1 minute)
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();   // leftmost = original client per RFC 7239
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

/**
 * Per-IP sliding-window rate limit, backed by Firestore.
 * Fail-open on Firestore errors: logs a warning, allows the request through.
 * Throws RateLimitError(429) only when the request would actually exceed the limit.
 */
export async function requireRateLimit(req: NextRequest, opts: RateLimitOpts): Promise<void> {
  const now = Date.now();
  const minuteKey = Math.floor(now / opts.windowMs);
  const retryAfterSec = Math.max(1, Math.ceil(((minuteKey + 1) * opts.windowMs - now) / 1000));
  const ipHash = hashIp(clientIp(req));
  const bucketDocId = `${opts.bucket}_${minuteKey}`;

  try {
    const db = getAdminDb();
    const bucketRef = db.collection('rateLimits').doc(bucketDocId);
    const ipRef = bucketRef.collection('ips').doc(ipHash);

    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ipRef);
      const current = snap.exists ? (snap.data()?.count ?? 0) : 0;
      if (current >= opts.limit) {
        return false;
      }
      // Mark the parent bucket with an expiresAt for the Firestore TTL policy to clean up.
      tx.set(bucketRef, {
        expiresAt: Timestamp.fromMillis(now + 5 * opts.windowMs),
      }, { merge: true });
      tx.set(ipRef, { count: FieldValue.increment(1) }, { merge: true });
      return true;
    });

    if (!allowed) {
      throw new RateLimitError('Too many requests', retryAfterSec);
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Fail open on any Firestore-side failure. Log so monitoring can catch a pattern.
    console.warn(JSON.stringify({
      kind: 'rate-limit',
      bucket: opts.bucket,
      result: 'fail-open',
      reason: err instanceof Error ? err.message : 'unknown',
    }));
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/server/rate-limit.ts
git commit -m "feat(search): add requireRateLimit helper (Firestore-backed, fail-open)"
```

---

## Task 2: Create `lib/server/search-params.ts`

**Files:**
- Create: `/Users/mohammedislam/git/maktabah-next/lib/server/search-params.ts`

- [ ] **Step 1: Write the module**

Create `/Users/mohammedislam/git/maktabah-next/lib/server/search-params.ts` with this exact content:

```typescript
export class BadRequestError extends Error {
  statusCode: 400 = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export type SearchMode = 'text' | 'semantic' | 'hybrid';

export interface SearchParams {
  q: string;             // 1..200 chars
  page: number;          // 1..50
  size: number;          // 1..25
  mode: SearchMode;
  author: string | null;
  chapter: string | null;
  titles: string[];      // possibly empty
  debug: boolean;
}

const MAX_QUERY_LEN = 200;
const MAX_PAGE_SIZE = 25;
const MAX_PAGE = 50;
const VALID_MODES: readonly SearchMode[] = ['text', 'semantic', 'hybrid'];

/**
 * Parse a bounded positive integer query param.
 * Returns `fallback` only when the param is omitted.
 * Throws BadRequestError(400) when the param is present but out of range or non-numeric.
 */
function parseBoundedInt(raw: string | null, paramName: string, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > max) {
    throw new BadRequestError(`${paramName}: must be 1..${max}`);
  }
  return n;
}

/**
 * Parse and validate /api/search query string parameters.
 * Throws BadRequestError(400, '<param>: <reason>') on the first violation.
 */
export function parseSearchParams(searchParams: URLSearchParams): SearchParams {
  const q = (searchParams.get('q') || '').trim();
  if (!q) {
    throw new BadRequestError('q: required');
  }
  if (q.length > MAX_QUERY_LEN) {
    throw new BadRequestError(`q: must be ≤ ${MAX_QUERY_LEN} characters`);
  }

  const size = parseBoundedInt(searchParams.get('size'), 'size', MAX_PAGE_SIZE, 10);
  const page = parseBoundedInt(searchParams.get('page'), 'page', MAX_PAGE, 1);

  const modeRaw = searchParams.get('mode') || 'hybrid';
  if (!VALID_MODES.includes(modeRaw as SearchMode)) {
    throw new BadRequestError(`mode: must be one of ${VALID_MODES.join(', ')}`);
  }
  const mode = modeRaw as SearchMode;

  return {
    q,
    page,
    size,
    mode,
    author: searchParams.get('author'),
    chapter: searchParams.get('chapter'),
    titles: searchParams.getAll('title'),
    debug: searchParams.get('debug') === 'true',
  };
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Ad-hoc verification of error paths**

Run this Node one-liner (from the repo root) to exercise each error path. The script does NOT need to be committed; it's a temporary verification.

```bash
npx tsx -e '
import { parseSearchParams, BadRequestError } from "./lib/server/search-params";

const cases = [
  { name: "missing q", params: new URLSearchParams(""), expect: "q: required" },
  { name: "long q", params: new URLSearchParams({ q: "a".repeat(201) }), expect: "q: must be ≤ 200 characters" },
  { name: "size 0", params: new URLSearchParams({ q: "x", size: "0" }), expect: "size: must be 1..25" },
  { name: "size 26", params: new URLSearchParams({ q: "x", size: "26" }), expect: "size: must be 1..25" },
  { name: "size abc", params: new URLSearchParams({ q: "x", size: "abc" }), expect: "size: must be 1..25" },
  { name: "page 0", params: new URLSearchParams({ q: "x", page: "0" }), expect: "page: must be 1..50" },
  { name: "page 51", params: new URLSearchParams({ q: "x", page: "51" }), expect: "page: must be 1..50" },
  { name: "invalid mode", params: new URLSearchParams({ q: "x", mode: "junk" }), expect: "mode: must be one of" },
];
for (const { name, params, expect } of cases) {
  try {
    parseSearchParams(params);
    console.log("FAIL", name, "(no throw)");
  } catch (err) {
    const msg = err instanceof BadRequestError ? err.message : String(err);
    console.log(msg.includes(expect) ? "OK  " : "FAIL", name, "-", msg);
  }
}
console.log("OK   happy path:", JSON.stringify(parseSearchParams(new URLSearchParams({ q: "mercy" }))));
'
```

Expected output: 8 `OK` lines for the error paths + 1 `OK happy path` line with a JSON object showing `q: "mercy"`, `page: 1`, `size: 10`, `mode: "hybrid"`, etc.

If any line says `FAIL`, fix the parser before continuing.

- [ ] **Step 4: Commit**

```bash
git add lib/server/search-params.ts
git commit -m "feat(search): add parseSearchParams with input caps and typed output"
```

---

## Task 3: Wire helpers into `/api/search/route.ts`

**Files:**
- Modify: `/Users/mohammedislam/git/maktabah-next/app/api/search/route.ts`

- [ ] **Step 1: Replace the entire file with the wired-up version**

Replace `/Users/mohammedislam/git/maktabah-next/app/api/search/route.ts` with this exact content:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/server/search';
import { requireAppCheck, AppCheckError } from '@/lib/server/app-check';
import { requireRateLimit, RateLimitError } from '@/lib/server/rate-limit';
import { parseSearchParams, BadRequestError } from '@/lib/server/search-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let params;
  try {
    await requireAppCheck(req);
    await requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 });
    params = parseSearchParams(req.nextUrl.searchParams);
  } catch (err) {
    if (err instanceof AppCheckError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, {
        status: err.statusCode,
        headers: { 'Retry-After': String(err.retryAfterSec) },
      });
    }
    if (err instanceof BadRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const searchResults = await searchDocuments(params.q, {
      page: params.page,
      size: params.size,
      author: params.author,
      chapter: params.chapter,
      titles: params.titles.length ? params.titles : null,
      mode: params.mode,
    });

    if (!params.debug) {
      searchResults.results = searchResults.results.map(({ source, ...rest }: any) => rest);
    }

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add app/api/search/route.ts
git commit -m "feat(search): wire rate limit + input caps into /api/search"
```

---

## Task 4: Add `firestore.rules` deny rule for `rateLimits/*`

**Files:**
- Modify: `/Users/mohammedislam/git/maktabah-next/firestore.rules`

The `rateLimits` collection is written and read only via the server-side Firebase Admin SDK, which bypasses security rules. This rule is a hardening measure: even though no client SHOULD ever try to read these docs, an explicit deny prevents accidental exposure if rules get loosened elsewhere.

- [ ] **Step 1: Open `firestore.rules` and find the existing `match /apiKeys/{keyHash}` block**

Locate this existing block near the bottom of `firestore.rules`:

```
    // API keys lookup collection — only accessible by Cloud Functions (admin SDK)
    // No client-side access needed; keys are looked up server-side during MCP auth
    match /apiKeys/{keyHash} {
      allow read, write: if false;
    }
```

- [ ] **Step 2: Add the new deny rule immediately after the `apiKeys` block**

Insert these lines after the closing `}` of the `apiKeys` match block, before the outer `match /databases/{database}/documents {` closing brace:

```
    // Rate-limit counters — server-only via Admin SDK. Hardening: deny all client access.
    match /rateLimits/{bucketKey} {
      allow read, write: if false;
      match /ips/{ipHash} {
        allow read, write: if false;
      }
    }
```

- [ ] **Step 3: Verify the rules file still parses**

If the Firebase CLI is installed:
```bash
firebase deploy --only firestore:rules --dry-run 2>&1 | head -20
```

If that's not available, just visually confirm the braces balance:
```bash
awk '{ for(i=1;i<=length($0);i++){c=substr($0,i,1); if(c=="{") n++; if(c=="}") n--} } END { print "balance:", n }' firestore.rules
```
Expected: `balance: 0`.

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "chore(firestore): deny client access to rateLimits collection"
```

---

## Task 5: End-to-end dev smoke test

**Files:** none (verification only). No commit at the end.

Verifies: (a) rate limit enforces at 30/min with `Retry-After`, (b) input caps reject with helpful 400s, (c) fail-open works when Firestore is unreachable. The dev server reads `.env.local` automatically; APP_CHECK_ENFORCE is `false` locally so we don't need a debug-token round-trip for these tests.

- [ ] **Step 1: Start the dev server in the background**

```bash
APP_CHECK_ENFORCE=false npm run dev
```

Wait for `Ready in <Xs>` in the output before continuing. The dev server logs structured JSON on each request — keep this terminal visible.

- [ ] **Step 2: Verify input cap responses**

In a second terminal:

```bash
echo "=== q missing ===" && curl -s -o /dev/null -w "%{http_code}\n" -i 'http://localhost:3000/api/search'
echo "=== q too long ===" && curl -s -w "\n%{http_code}\n" "http://localhost:3000/api/search?q=$(python3 -c 'print("a"*201)')"
echo "=== size 0 ===" && curl -s -w "\n%{http_code}\n" 'http://localhost:3000/api/search?q=mercy&size=0'
echo "=== size 26 ===" && curl -s -w "\n%{http_code}\n" 'http://localhost:3000/api/search?q=mercy&size=26'
echo "=== page 0 ===" && curl -s -w "\n%{http_code}\n" 'http://localhost:3000/api/search?q=mercy&page=0'
echo "=== page 51 ===" && curl -s -w "\n%{http_code}\n" 'http://localhost:3000/api/search?q=mercy&page=51'
echo "=== invalid mode ===" && curl -s -w "\n%{http_code}\n" 'http://localhost:3000/api/search?q=mercy&mode=junk'
```

Expected:
- `q missing` → `400`
- `q too long` → body contains `q: must be ≤ 200 characters`, status `400`
- `size 0` → body `{"error":"size: must be 1..25"}`, status `400`
- `size 26` → body `{"error":"size: must be 1..25"}`, status `400`
- `page 0` → body `{"error":"page: must be 1..50"}`, status `400`
- `page 51` → body `{"error":"page: must be 1..50"}`, status `400`
- `invalid mode` → body `{"error":"mode: must be one of text, semantic, hybrid"}`, status `400`

- [ ] **Step 3: Verify rate limit enforces**

Send 32 successive requests as fast as possible:

```bash
for i in $(seq 1 32); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" 'http://localhost:3000/api/search?q=mercy&size=2'
done
```

Expected: requests 1–30 return `200`, requests 31 and 32 return `429`. (If the OpenSearch backend is slow, some early requests may take a couple seconds. That's fine — the rate limit is about request *count*, not RPS.)

- [ ] **Step 4: Verify `Retry-After` header on 429**

```bash
curl -si 'http://localhost:3000/api/search?q=mercy&size=2' | grep -iE 'retry-after|^HTTP/'
```

Expected: `HTTP/1.1 429` and a `Retry-After: <N>` header with N in roughly `1..60`. If you see 429 but no `Retry-After`, the route is not adding the header from the catch block — fix Task 3.

- [ ] **Step 5: Wait for the rate-limit window to roll over**

The window is 1 minute. Wait until the next minute boundary, then:

```bash
sleep 65
curl -s -o /dev/null -w "post-window: %{http_code}\n" 'http://localhost:3000/api/search?q=mercy&size=2'
```

Expected: `post-window: 200` — the counter reset.

- [ ] **Step 6: Verify fail-open behavior**

Stop the dev server (Ctrl-C). Restart with a bogus Firestore emulator host so `runTransaction` will fail:

```bash
FIRESTORE_EMULATOR_HOST=localhost:9999 APP_CHECK_ENFORCE=false npm run dev
```

Once ready, hit the endpoint once:

```bash
curl -s -o /dev/null -w "fail-open: %{http_code}\n" 'http://localhost:3000/api/search?q=mercy&size=2'
```

Expected:
- `fail-open: 200` (the request succeeded despite Firestore being unreachable)
- The dev server terminal shows a `console.warn` line like `{"kind":"rate-limit","bucket":"search","result":"fail-open","reason":"..."}`.

- [ ] **Step 7: Stop the dev server**

Ctrl-C. No commit (verification only).

---

## Task 6: Document Rate Limiting in `README.md`

**Files:**
- Modify: `/Users/mohammedislam/git/maktabah-next/README.md`

- [ ] **Step 1: Locate the "Search Modes" subsection**

Search `README.md` for the heading `### Search Modes`. It sits inside the `## AWS OpenSearch Setup` section, just before `## Development`.

- [ ] **Step 2: Append a new `### Rate Limiting` subsection immediately after the existing `### Search Modes` block**

Insert this content directly after the `### Search Modes` block ends (the line `Example: /api/search?q=mercy+and+compassion&mode=hybrid`) and before the `## Firebase App Check Setup` heading begins:

```markdown
### Rate Limiting

`/api/search` is rate-limited to **30 requests per minute per client IP** to prevent abuse on this paid-backend endpoint (OpenSearch + Bedrock).

- **Storage:** Firestore, under the `rateLimits/` root collection. The helper writes an `expiresAt` field on each per-minute bucket doc; a Firestore TTL policy auto-deletes stale buckets after 5 minutes.
- **Behavior on limit hit:** HTTP `429 Too Many Requests` with body `{"error":"Too many requests"}` and a `Retry-After: <seconds>` header.
- **Behavior on Firestore outage:** Fail-open — the request proceeds, a `console.warn` is logged. We don't punish users for our infra problems.
- **Tuning:** Edit the call in [`app/api/search/route.ts`](app/api/search/route.ts) — `requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 })`. A `git commit` + push to `main` deploys the change via App Hosting in ~3–5 minutes.

The helper itself is generic (`lib/server/rate-limit.ts`) and can be applied to any other route by passing a different `bucket` name.

#### One-time Firestore TTL setup

The auto-cleanup of stale buckets requires a TTL policy in the Firebase Console:

1. Firebase Console → **Firestore Database** → **TTL** tab → **Add policy**.
2. **Collection group:** `rateLimits`. **Timestamp field:** `expiresAt`.
3. Save.

Firestore will start auto-deleting expired bucket docs within ~24h of the policy taking effect. The rate-limit code works without this step (counters just accumulate as small docs); the TTL keeps storage costs near zero.
```

- [ ] **Step 3: Verify the markdown sanity**

Run from the repo root:
```bash
grep -c '^```' README.md
```
Expected: an even number (every fence opened is closed). If odd, find the unmatched fence.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add Rate Limiting subsection"
```

---

## Task 7: Update `.claude/skills/api/SKILL.md`

**Files:**
- Modify: `/Users/mohammedislam/git/maktabah-next/.claude/skills/api/SKILL.md`

- [ ] **Step 1: Add `requireRateLimit` to the "Auth Helpers" section**

Find the existing "Auth Helpers" section. It currently has two bullet items: `requireAppCheck` and `requireUser`. Add a third bullet between them and the closing paragraph "Both helpers can stack…". The closing paragraph also needs to be updated to mention all three helpers can stack.

Replace the entire "Auth Helpers" section (from the heading `## Auth Helpers` to the line before `## Required Decisions Before Adding Any New API Route`) with:

```markdown
## Auth Helpers

All three helpers live under `lib/server/` and follow the same shape: throw a typed error on failure, let the route handler map to a JSON 4xx.

- **`requireAppCheck(req)`** ([`lib/server/app-check.ts`](../../../lib/server/app-check.ts)) — Verifies the `X-Firebase-AppCheck` JWT. Gated by `APP_CHECK_ENFORCE` env var (kill switch). Use for routes that should only accept calls from a real instance of the web app. Default for any new route that hits a paid external service or could be abused at scale.

- **`requireUser(req)`** ([`lib/server/api-keys.ts`](../../../lib/server/api-keys.ts)) — Verifies the Firebase ID token from the `Authorization: Bearer …` header and returns the caller's `uid`. Use for routes that read or write per-user data.

- **`requireRateLimit(req, opts)`** ([`lib/server/rate-limit.ts`](../../../lib/server/rate-limit.ts)) — Per-IP sliding-window rate limit, backed by Firestore. Takes `{ bucket, limit, windowMs }`. Fails open on Firestore errors (a cost control, not a security control — availability matters more than perfect enforcement). Returns `429` with a `Retry-After` header when exceeded.

All three helpers can stack — call `requireAppCheck` first, then `requireRateLimit`, then `requireUser`, for a route that needs all three.
```

- [ ] **Step 2: Update the "Required Decisions" checklist**

Find item 4 in the "Required Decisions Before Adding Any New API Route" section. It currently reads:

```markdown
4. **Rate limit needed?** (Yes/no flag.) Currently there is no shared rate-limit middleware — flag this in the PR description so it isn't forgotten.
```

Replace it with:

```markdown
4. **Rate limit needed?** If yes, add `await requireRateLimit(req, { bucket: '<route-name>', limit: <N>, windowMs: 60_000 });` after `requireAppCheck`. Pick a `bucket` name that namespaces the counter (typically the route name). Default `limit` of 30/min matches `/api/search`; tune based on expected legitimate traffic.
```

- [ ] **Step 3: Update the example route template in "Adding a New Next.js API Route"**

Find the example code block under "Adding a New Next.js API Route". It currently calls only `requireAppCheck`. Replace the template's `try` block to include `requireRateLimit` (commented out, as opt-in):

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

- [ ] **Step 4: Verify markdown sanity**

```bash
grep -c '^```' .claude/skills/api/SKILL.md
```
Expected: an even number.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/api/SKILL.md
git commit -m "docs(skills): document requireRateLimit in api skill"
```

---

## Task 8: Open PR (production deploy is deferred)

**Files:** none (publish + create PR).

This task pushes the branch and opens a PR. The user reviews, merges, and watches the App Hosting rollout themselves (matching the App Check rollout style — production deploys are user-driven).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/search-rate-limit
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "feat(search): per-IP rate limit + input caps on /api/search" --body "$(cat <<'EOF'
## Summary

Hardens `/api/search` for public traffic by adding per-IP rate limiting and input validation. Complements the App Check work that already shipped — App Check stops non-attested clients; this stops abuse from real-browser sessions.

- **Rate limit:** 30 requests per minute per IP, Firestore-backed sliding window. Same pattern as the existing MCP API rate limiter (`functions/lib/api-key-auth.js`).
- **Input caps:** `q ≤ 200 chars`, `size ≤ 25`, `page ≤ 50`. Returns `400` with a specific error message on violation.
- **Fail-open** on Firestore errors (a cost control, not a security control — availability matters more).
- **No new dependencies, no new env vars.**

Spec: `docs/superpowers/specs/2026-06-02-public-search-hardening-design.md`
Plan: `docs/superpowers/plans/2026-06-02-public-search-hardening.md`

## Test plan

- [x] Typecheck (`npx tsc --noEmit`) passes
- [x] Input cap responses verified locally (400 with the right message for each violation)
- [x] Rate limit verified locally (30 ok, 31st returns 429 with `Retry-After`, counter resets next minute)
- [x] Fail-open verified locally (set `FIRESTORE_EMULATOR_HOST=localhost:9999`, request still succeeds + `console.warn` logged)
- [ ] **Post-merge:** configure Firestore TTL policy on `rateLimits` collection group (Firebase Console → Firestore → TTL → Add policy → field `expiresAt`). See README "Rate Limiting" section.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

The PR URL is printed by `gh pr create`. Surface it to the user.

- [ ] **Step 3: No commit**

This task only publishes and opens a PR — there's nothing to commit.

---

## Done

Eight tasks. When the PR is merged and the Firestore TTL is configured, `/api/search` is hardened for public traffic.

Per AGENTS.md P0.1, do not generate a summary/report file. The plan, the spec, and the commit history are the record.
