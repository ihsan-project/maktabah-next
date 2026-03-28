# MCP Server Implementation Plan

Expose Maktabah's Islamic research data (Quran, Hadith, Arabic dictionary) as a self-hosted MCP server that any LLM agent can connect to. Users get a dashboard to generate API keys and manage access.

---

## Phase 1: Firestore Schema & API Key Management Backend

**Goal:** Create the Firestore collections and Cloud Functions for generating, validating, and revoking API keys.

**Changes:**
- `firestore.rules` — Add rules for `apiKeys` collection and `users/{uid}/apiKeys` subcollection
- `functions/index.js` — Add three new HTTPS callable functions:
  - `generateApiKey` — Authenticated user generates a key. Creates a doc in `apiKeys/{hashedKey}` (for fast lookup) and `users/{uid}/apiKeys/{keyId}` (for listing). Fields: `key` (prefix only, e.g. `mk_...abc`), `name` (user-provided label), `uid`, `createdAt`, `lastUsedAt`, `requestCount`, `rateLimit` (requests/min, default 30), `status` (active/revoked)
  - `revokeApiKey` — User revokes their own key by ID
  - `listApiKeys` — User lists their own keys with usage stats
- `functions/lib/api-key-auth.js` — Middleware function: given a Bearer token, look up `apiKeys/{hash}`, check status, enforce rate limit (sliding window counter in Firestore or in-memory), return uid or 401/429

**Firestore structure:**
```
apiKeys/{sha256(key)}
  → uid, name, createdAt, lastUsedAt, requestCount, rateLimit, status

users/{uid}/apiKeys/{keyId}
  → keyPrefix, name, createdAt, status (mirror for listing)
```

**Dependencies:** None

**Test plan:**
- Call `generateApiKey` from Firebase shell, verify docs created in both collections
- Call `listApiKeys`, verify it returns the key
- Call `revokeApiKey`, verify status changes to `revoked`
- Test auth middleware with valid key → passes, revoked key → 401, no key → 401
- Test rate limiting: send 31 requests in rapid succession → 30 pass, 31st returns 429

**Deploy notes:**
- Deploy Firestore rules first, then functions
- No frontend changes yet — test via Firebase shell or curl

**Rollback:** Delete the new functions and revert Firestore rules. No existing data affected.

---

## Phase 2: MCP Server Core (Transport + Auth)

**Goal:** Stand up a working MCP server over SSE/HTTP with API key authentication, deployed as a Firebase Cloud Function. Expose one basic `ping` tool to verify end-to-end connectivity.

**Changes:**
- `functions/package.json` — Add `@modelcontextprotocol/sdk` dependency
- `functions/mcp/server.js` — MCP server setup using `McpServer` from the SDK:
  - Server info: name `maktabah`, version from package.json
  - Capabilities: tools (no resources/prompts initially)
  - Register a `ping` tool that returns server status
- `functions/mcp/transport.js` — SSE transport adapter for Firebase Cloud Functions:
  - Handle `GET /mcp/sse` → SSE connection (event stream)
  - Handle `POST /mcp/messages` → JSON-RPC message handling
  - Wire API key auth middleware before transport
- `functions/index.js` — Export new `mcpServer` Cloud Function (HTTPS)
- `firebase.json` — Add rewrite: `/mcp/**` → function `mcpServer`

**Dependencies:** Phase 1

**Test plan:**
- Deploy and hit `GET /mcp/sse` with valid API key → SSE stream opens
- Send `tools/list` JSON-RPC message → returns `ping` tool
- Send `tools/call` for `ping` → returns success response
- Hit without API key → 401
- Hit with revoked key → 401
- Verify `lastUsedAt` and `requestCount` update in Firestore

**Deploy notes:**
- New function `mcpServer` needs same secrets as `nextApiHandler` plus Firestore access
- SSE requires the function to stay alive — may need `timeoutSeconds: 300` and `minInstances: 0`
- The 540s max timeout is fine — MCP SDK handles reconnection automatically between requests

**Rollback:** Remove `mcpServer` function and `/mcp/**` rewrite. No impact on existing app.

---

## Phase 3: MCP Tools — Search & Lookups

**Goal:** Implement the five core MCP tools that expose Maktabah's data to LLM agents.

**Changes:**
- `functions/mcp/tools/search.js` — `search` tool:
  - Params: `query` (required), `mode` (text|semantic|hybrid, default hybrid), `collection` (quran|bukhari|all), `translator`, `chapter`, `limit` (max 20, default 10)
  - Reuses existing search logic from `functions/index.js` (extract into shared module)
  - Returns: results array with verse text, Arabic, reference, translator, score

- `functions/mcp/tools/get-verse.js` — `get_verse` tool:
  - Params: `surah` (1-114), `ayah` (number), `translator` (optional, default all)
  - Direct OpenSearch lookup by chapter + verse
  - Returns: all translations, Arabic text, surah metadata

- `functions/mcp/tools/get-hadith.js` — `get_hadith` tool:
  - Params: `volume` (1-9), `hadith` (number)
  - Direct OpenSearch lookup by volume + verse + title=bukhari
  - Returns: hadith text, volume, chapter name

- `functions/mcp/tools/lookup-root.js` — `lookup_root` tool:
  - Params: `root` (Arabic 3-letter root, e.g. "ر ح م")
  - Fetches roots.json + lanes/{letter}.json from Firebase Storage (cached in-memory across warm invocations)
  - Returns: Lane's Lexicon definition, occurrence count, sample verses, morphological forms

- `functions/mcp/tools/get-morphology.js` — `get_word_morphology` tool:
  - Params: `surah` (1-114), `ayah` (number)
  - Fetches words/{surah}.json from Firebase Storage (cached in-memory)
  - Returns: word-by-word breakdown (Arabic, transliteration, translation, root, POS, morphology)

- `functions/lib/storage-cache.js` — Firebase Storage fetch utility with in-memory LRU cache:
  - `getCachedJson(path)` — Fetches JSON from Storage bucket, caches in memory
  - Cache persists across warm Cloud Function invocations
  - TTL of 1 hour to pick up data updates without redeploying

- `functions/lib/search-core.js` — Extract shared search logic (BM25, KNN, hybrid, dedup, highlight) from `functions/index.js` so both the existing API and MCP tools use the same code

**Dependencies:** Phase 2

**Test plan:**
- For each tool: call via MCP protocol with valid params → verify correct results
- `search` — query "patience" → returns relevant Quran/Bukhari results
- `get_verse` — surah 1, ayah 1 → returns Al-Fatiha opening with all translations
- `get_hadith` — volume 1, hadith 1 → returns first Bukhari hadith
- `lookup_root` — "ر ح م" → returns mercy-related definition and 339 occurrences
- `get_morphology` — surah 1, ayah 1 → returns 4 words with full breakdown
- Test with Claude Desktop: add server config, ask "What does the Quran say about patience?" → agent calls search tool

**Deploy notes:**
- Static JSON files (roots.json, lanes/*.json, words/*.json) are fetched from Firebase Storage at runtime with in-memory caching. No need to bundle ~35MB of data with the function deploy — keeps deploys lean and allows data updates without redeploying
- Ensure all static JSON is uploaded to Firebase Storage (already there via existing loader scripts)
- First request for each file incurs a cold-cache penalty (~100-200ms); subsequent requests served from memory
- Secrets: same as Phase 2

**Rollback:** Remove tool registrations. MCP server still works, just returns empty tool list.

---

## Phase 4: Developer Dashboard UI

**Goal:** Add a `/developers` page accessible from the side menu where authenticated users can generate API keys, see their keys, copy the MCP server URL, and revoke keys.

**Changes:**
- `app/developers/page.tsx` — New page (wrapped in `ProtectedRoute`):
  - **Connection info card:** MCP server URL with copy button, example config snippet for Claude Desktop / Cursor
  - **Generate key form:** Name/label input + "Generate" button → calls `generateApiKey` callable
  - **Keys table:** List of user's keys showing: name, key prefix (`mk_...abc`), created date, last used, request count, status, revoke button
  - Show the full key ONCE on generation (modal/alert) — never retrievable again

- `app/components/SideMenu.tsx` — Add "Developers" nav item with `FiCode` icon between Bookmarks and the divider

- `lib/api-keys.ts` — Client-side functions:
  - `generateApiKey(name)` — calls Firebase callable
  - `revokeApiKey(keyId)` — calls Firebase callable
  - `listApiKeys()` — calls Firebase callable
  - Types: `ApiKey`, `GenerateApiKeyResponse`

- `types/index.ts` — Add `ApiKey` and related interfaces

**Dependencies:** Phase 1 (backend), Phase 2 (MCP URL to display)

**Test plan:**
- Navigate to `/developers` while logged in → page renders
- Navigate while logged out → redirected to `/`
- Generate a key → modal shows full key, key appears in table
- Copy MCP URL → clipboard contains correct URL
- Revoke a key → status changes to revoked, row grayed out
- Side menu shows "Developers" link with active state on `/developers`

**Deploy notes:**
- Frontend-only deploy (`npm run deploy:hosting`) after backend is live
- The MCP URL shown should be the production URL: `https://maktabah-8ac04.web.app/mcp/sse` (or custom domain if configured)

**Rollback:** Remove the page and side menu link. Backend unaffected.

---

## Phase 5: Usage Tracking & Rate Limit Dashboard

**Goal:** Show per-key usage analytics on the developer dashboard and enforce robust rate limiting.

**Changes:**
- `functions/lib/usage-tracking.js` — On each MCP request:
  - Increment `apiKeys/{hash}.requestCount`
  - Update `apiKeys/{hash}.lastUsedAt`
  - Write to `apiKeys/{hash}/usage/{YYYY-MM-DD}` daily aggregate doc: `{ requests: increment, tools: { search: increment, get_verse: increment, ... } }`

- `functions/index.js` — Add `getApiKeyUsage` callable:
  - Params: `keyId`, `days` (default 7)
  - Returns: daily request counts and per-tool breakdown

- `app/developers/page.tsx` — Enhance with:
  - Expandable row per key showing daily usage chart (last 7 days)
  - Per-tool breakdown (which tools are being called most)
  - Current rate limit status (requests remaining this minute)

- `lib/api-keys.ts` — Add `getApiKeyUsage(keyId, days)` client function

- `functions/lib/api-key-auth.js` — Harden rate limiting:
  - Use Firestore `apiKeys/{hash}/rateLimit/{minuteWindow}` with TTL
  - Sliding window counter: increment on each request, reject if over limit
  - Return `X-RateLimit-Remaining` and `X-RateLimit-Reset` headers

**Dependencies:** Phase 4

**Test plan:**
- Make 10 requests with a key → usage doc shows 10 requests for today
- View dashboard → chart shows today's usage
- Exceed rate limit → 429 response with correct headers
- Check per-tool breakdown → shows correct tool distribution

**Deploy notes:**
- Deploy functions first (usage tracking), then hosting (dashboard)
- Existing keys start accumulating usage data from deploy time
- Consider a Firestore TTL policy on rate limit docs to auto-cleanup

**Rollback:** Remove usage tracking writes. Dashboard reverts to Phase 4 (no charts). Rate limiting falls back to simple counter.

---

## Decisions Made

### 1. Cloud Functions for SSE — DECIDED

Using Firebase Cloud Functions (gen2) with `timeoutSeconds: 300`. The 540s max timeout is acceptable — the MCP SDK handles automatic reconnection between requests, and most MCP interactions are short-lived request/response cycles. No need for Cloud Run complexity. Revisit only if users report persistent connection issues.

### 2. Firebase Storage with In-Memory Cache for Static Data — DECIDED

Fetching static JSON (roots.json, lanes/*.json, words/*.json, ~35MB total) from Firebase Storage at runtime with an in-memory LRU cache. This keeps function deploys lean and — critically — allows the library data to grow significantly without redeploying functions. New books, dictionaries, or reference data just need to be uploaded to Storage. Cold-cache penalty is ~100-200ms per file on first access; subsequent requests are instant from memory.

### 3. Firestore Rate Limiting — DECIDED

Using Firestore counters for rate limiting (~2 ops per request). Simple and fits current scale. When usage grows, add a caching layer (Redis via Memorystore or Upstash) without changing the external API — the rate limit middleware is the only thing that needs to swap.
