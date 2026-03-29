# MCP Server Implementation Plan

Expose Maktabah's Islamic research data (Quran, Hadith, Arabic dictionary) as a self-hosted MCP server that any LLM agent can connect to. Users get a dashboard to generate API keys and manage access.

---

## Phase 1: Firestore Schema & API Key Management Backend ✅

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
- Make sure to Deploy Firestore rules updates
- No frontend changes yet — test via Firebase shell or curl

**Rollback:** Delete the new functions and revert Firestore rules. No existing data affected.

---

## Phase 2: MCP Server Core (Transport + Auth) ✅

**Goal:** Stand up a working MCP server over Streamable HTTP with API key authentication, deployed as a Firebase Cloud Function. Expose one basic `ping` tool to verify end-to-end connectivity.

**Changes:**
- `functions/package.json` — Add `@modelcontextprotocol/sdk` and `zod` dependencies
- `functions/mcp/server.js` — MCP server factory using `McpServer` from the SDK:
  - Server info: name `maktabah`, version `1.0.0`
  - Capabilities: tools (with listChanged)
  - Register a `ping` tool that returns server status + timestamp
- `functions/mcp/handler.js` — Stateless Streamable HTTP handler:
  - Validates API key via Bearer token before MCP protocol layer
  - Creates fresh server + `StreamableHTTPServerTransport` per request (stateless, Cloud Function friendly)
  - Sets rate limit headers on response
  - Returns JSON-RPC errors for auth failures (401/429)
  - Cleans up transport + server after each request
- `functions/index.js` — Export `mcpServer` Cloud Function (HTTPS, `timeoutSeconds: 300`)
- `firebase.json` — Add rewrite: `/mcp` → function `mcpServer`

**Note:** Used Streamable HTTP transport instead of SSE — it's the current MCP standard (replaced SSE as of March 2025) and works better with stateless Cloud Functions.

**Dependencies:** Phase 1

**Test plan:**
- POST to `/mcp` with `initialize` JSON-RPC → returns server info (maktabah v1.0.0)
- POST `tools/list` → returns `ping` tool
- POST `tools/call` for `ping` → returns `{ status: "ok", server: "maktabah" }`
- POST without API key → 401
- POST with revoked key → 401
- Verify rate limit headers in response (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)

**Deploy notes:**
- Function uses `timeoutSeconds: 300`, `minInstances: 0`
- No secrets needed on `mcpServer` itself — auth hits Firestore only. Search tools (Phase 3) will need OpenSearch/AWS secrets.

**Rollback:** Remove `mcpServer` function and `/mcp` rewrite. No impact on existing app.

---

## Phase 3: MCP Tools — Search & Lookups ✅

**Goal:** Implement the five core MCP tools that expose Maktabah's data to LLM agents.

**Changes:**
- `functions/lib/search-core.js` — Extracted shared search logic (clients, embedding, BM25, KNN, hybrid, dedup, highlight, RRF) from `functions/index.js`. Both the existing `/api/search` and MCP tools now use the same module. Added `lookupDocuments()` for direct chapter+verse lookups.
- `functions/index.js` — Refactored to import from `search-core.js`, removed ~320 lines of duplicated code. Added OpenSearch/AWS secrets to `mcpServer` function.
- `functions/lib/storage-cache.js` — Firebase Storage fetch with in-memory cache (1hr TTL). Persists across warm invocations.
- `functions/mcp/tools/search.js` — `search` tool: hybrid/keyword/semantic across Quran + Bukhari with filters
- `functions/mcp/tools/get-verse.js` — `get_verse` tool: all translations + Arabic + metadata for a specific ayah
- `functions/mcp/tools/get-hadith.js` — `get_hadith` tool: lookup by volume + hadith number
- `functions/mcp/tools/lookup-root.js` — `lookup_root` tool: Lane's Lexicon + occurrence data from Storage
- `functions/mcp/tools/get-morphology.js` — `get_word_morphology` tool: word-by-word breakdown from Storage
- `functions/mcp/server.js` — Registers all 6 tools (ping + 5 core)
- `quran_loader/upload-words-to-storage.js` — One-time script to upload word/root/lanes data to Firebase Storage

**Dependencies:** Phase 2

**Deploy notes:**
- **Before first deploy:** run to upload word/root/lanes JSON files to Firebase Storage. This is a one-time operation.
```
gcloud auth application-default login
node quran_loader/upload-words-to-storage.js
```

Run these to give access to Google Cloud Run:
```
gcloud functions add-invoker-policy-binding generateApiKey --region=us-central1 --member="allUsers" --project=maktabah-8ac04
gcloud functions add-invoker-policy-binding revokeApiKey --region=us-central1 --member="allUsers" --project=maktabah-8ac04
gcloud functions add-invoker-policy-binding listApiKeys --region=us-central1 --member="allUsers" --project=maktabah-8ac04

gcloud functions add-invoker-policy-binding mcpServer \
  --region=us-central1 \
  --member="allUsers" \
  --project=maktabah-8ac04
```

- Static JSON fetched from Storage at runtime with in-memory caching (1hr TTL)
- `mcpServer` function now needs OpenSearch/AWS secrets (added to function config)
- First request for each file has ~100-200ms cold-cache penalty; subsequent requests are instant

**Rollback:** Remove tool registrations from `server.js`. MCP server returns only `ping` tool.

---

## Phase 4: Developer Dashboard UI ✅

**Goal:** Add a `/developers` page accessible from the side menu where authenticated users can generate API keys, see their keys, copy the MCP server URL, and revoke keys.

**Changes:**
- `app/developers/page.tsx` — New protected page with three sections:
  - **MCP Server card:** Endpoint URL with copy button, full JSON config snippet for Claude Desktop / Cursor with copy button
  - **API Keys card:** Generate form (name input + button), keys table (name, prefix, date, status, revoke), max 5 active keys enforced by backend
  - **Available Tools card:** Lists all 5 MCP tools with descriptions
  - **New Key modal:** Shows full key once on generation with copy button + warning it can't be retrieved again
- `app/components/SideMenu.tsx` — Added "Developers" nav item with `FiCode` icon after Bookmarks
- `lib/api-keys.ts` — Client-side wrapper for Firebase callable functions (`generateApiKey`, `revokeApiKey`, `listApiKeys`)
- `types/index.ts` — Added `ApiKey` and `GenerateApiKeyResponse` interfaces

**Dependencies:** Phase 1 (backend), Phase 2 (MCP URL to display)

**Deploy notes:**
- MCP URL shown: `https://maktabah-8ac04.web.app/mcp` (Streamable HTTP, not SSE)
- Frontend-only deploy (`npm run deploy:hosting`) after backend is live

**Rollback:** Remove the page and side menu link. Backend unaffected.

---

## Phase 5: Usage Tracking & Rate Limit Dashboard ✅

**Goal:** Show per-key usage analytics on the developer dashboard and enforce robust rate limiting.

**Changes:**
- `functions/lib/usage-tracking.js` — Two functions:
  - `trackToolUsage(keyHash, toolName)` — fire-and-forget write to `apiKeys/{hash}/usage/{YYYY-MM-DD}` with per-tool counters using Firestore increments
  - `getUsageData(keyHash, days)` — reads daily usage docs, returns array with zero-filled missing days
- `functions/mcp/handler.js` — Wired tool tracking: inspects JSON-RPC body for `tools/call` method and tracks the tool name before passing to transport
- `functions/index.js` — Added `getApiKeyUsage` callable: verifies key ownership, returns `requestCount`, `lastUsedAt`, `rateLimit`, and daily usage array
- `lib/api-keys.ts` — Added `getApiKeyUsage(keyId, days)` client function
- `types/index.ts` — Added `DailyUsage` and `ApiKeyUsageResponse` interfaces
- `app/developers/page.tsx` — Enhanced keys table:
  - Click active key row to expand/collapse usage panel
  - Usage panel shows: total requests, rate limit, last used, per-tool breakdown (7 days), and daily bar chart
  - Chevron icons indicate expandability

**Note:** Rate limiting was already implemented in Phase 1 (`api-key-auth.js`) with Firestore sliding window counters and `X-RateLimit-*` headers. No changes needed there.

**Dependencies:** Phase 4

**Deploy notes:**
- Deploy functions first (usage tracking), then hosting (dashboard)
- Existing keys start accumulating usage data from deploy time
- Consider a Firestore TTL policy on rate limit window docs to auto-cleanup

**Rollback:** Remove usage tracking writes. Dashboard reverts to Phase 4 (no charts). Rate limiting falls back to simple counter.

---

## Decisions Made

### 1. Cloud Functions for SSE — DECIDED

Using Firebase Cloud Functions (gen2) with `timeoutSeconds: 300`. The 540s max timeout is acceptable — the MCP SDK handles automatic reconnection between requests, and most MCP interactions are short-lived request/response cycles. No need for Cloud Run complexity. Revisit only if users report persistent connection issues.

### 2. Firebase Storage with In-Memory Cache for Static Data — DECIDED

Fetching static JSON (roots.json, lanes/*.json, words/*.json, ~35MB total) from Firebase Storage at runtime with an in-memory LRU cache. This keeps function deploys lean and — critically — allows the library data to grow significantly without redeploying functions. New books, dictionaries, or reference data just need to be uploaded to Storage. Cold-cache penalty is ~100-200ms per file on first access; subsequent requests are instant from memory.

### 3. Firestore Rate Limiting — DECIDED

Using Firestore counters for rate limiting (~2 ops per request). Simple and fits current scale. When usage grows, add a caching layer (Redis via Memorystore or Upstash) without changing the external API — the rate limit middleware is the only thing that needs to swap.

---

## Testing MCP Tools via curl

All requests go to the MCP endpoint as JSON-RPC over Streamable HTTP. Replace `mk_YOUR_API_KEY` with a real key from the `/developers` dashboard.

### Initialize (handshake)

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": { "name": "curl-test", "version": "1.0.0" }
    }
  }'
```

### Ping (health check)

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "ping",
      "arguments": {}
    }
  }'
```

### Search (hybrid search across Quran & Bukhari)

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "search",
      "arguments": {
        "query": "mercy",
        "mode": "hybrid",
        "limit": 5
      }
    }
  }'
```

### Get Verse

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_verse",
      "arguments": { "surah": 1, "ayah": 1 }
    }
  }'
```

### Get Hadith

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "tools/call",
    "params": {
      "name": "get_hadith",
      "arguments": { "volume": 1, "hadith": 1 }
    }
  }'
```

### Lookup Root (Arabic root in Lane's Lexicon)

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "tools/call",
    "params": {
      "name": "lookup_root",
      "arguments": { "root": "ر ح م" }
    }
  }'
```

### Get Word Morphology

```bash
curl -X POST https://maktabah-8ac04.web.app/mcp \
  -H "Authorization: Bearer mk_YOUR_API_KEY" \
  -H "Accept: application/json, text/event-stream" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 7,
    "method": "tools/call",
    "params": {
      "name": "get_word_morphology",
      "arguments": { "surah": 1, "ayah": 1 }
    }
  }'
```
