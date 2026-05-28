# Firebase App Hosting Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Maktabah Next.js app from static export on Firebase Hosting + Cloud Functions to SSR on Firebase App Hosting, folding all HTTP/callable functions into Next.js API routes (MCP server stays a Cloud Function) and converting SEO-valuable pages to server rendering.

**Architecture:** Firebase App Hosting runs the Next.js server (SSR + Route Handlers) on Cloud Run. The unchanged `mcpServer` Cloud Function is reached on the apex domain via a Next.js rewrite proxy at `/mcp`. Search, storage proxy, and API-key management become Node.js Route Handlers backed by new TypeScript server modules under `lib/server/`; the MCP function keeps its own copy of the shared logic in `functions/` so it stays isolated and low-risk.

**Tech Stack:** Next.js 14 (App Router, Route Handlers), Firebase App Hosting (Cloud Run), firebase-admin, OpenSearch (`@opensearch-project/opensearch` + AWS SigV4), AWS Bedrock (`@aws-sdk/client-bedrock-runtime`), TypeScript.

**Testing approach (per user decision):** Verification-driven — no test framework is added. Each task is verified with concrete commands: `npx tsc --noEmit`, `npm run build`, `npm run dev` + `curl`, view-source for SSR, and deployed smoke checks.

**Spec:** `docs/superpowers/specs/2026-05-24-firebase-app-hosting-migration-design.md`

---

## Important execution notes (read first)

- **Production stays live on the old static hosting until Phase 4.** After Task 2 (`output: 'export'` removed) the legacy `npm run build:firebase` / `firebase deploy --only hosting` flow is no longer valid. **Do NOT run the old deploy scripts after Phase 1.** The currently-deployed site keeps serving the last release until the App Hosting cutover in Phase 4.
- **AGENTS.md P0.5:** never overwrite `.env.local` without asking. Tasks that need new env vars instruct you to add them manually and confirm first.
- **AGENTS.md P0.1:** do not generate summary/report files when done.
- **Branch:** do all work on a feature branch (e.g. `feat/app-hosting`), not `main`.
- **Local verification of admin/Firestore routes** requires the Firebase emulators running (`npm run functions` starts auth+functions+firestore emulators) and the emulator env vars set (Task 3 covers this). The client already connects to the auth/firestore emulators in development (`firebaseConfig.ts`).

---

## File Structure

**New files:**
- `lib/server/firebase-admin.ts` — singleton firebase-admin init (ADC in prod, emulators in dev). Exports `getAdminApp()`, `getAdminAuth()`, `getAdminDb()`, `getAdminStorage()`.
- `lib/server/search.ts` — TypeScript port of `functions/lib/search-core.js`: OpenSearch + Bedrock clients, `searchDocuments()`.
- `lib/server/api-keys.ts` — `hashApiKey()`, `generateRawApiKey()`, `requireUser(req)` (verifies Bearer ID token → uid).
- `lib/server/usage.ts` — `getUsageData(keyHash, days)`.
- `app/api/search/route.ts` — GET search endpoint.
- `app/api/storage/[...path]/route.ts` — GET storage proxy.
- `app/api/keys/route.ts` — GET (list) + POST (generate).
- `app/api/keys/[keyId]/route.ts` — DELETE (revoke).
- `app/api/keys/[keyId]/usage/route.ts` — GET (usage).
- `app/components/HomeRedirect.tsx` — tiny client island: redirects signed-in users to `/search`.
- `app/developers/DevelopersKeysClient.tsx` — auth-gated client island (API-keys table moved out of the page).

**Modified files:**
- `next-config.js` — remove `output: 'export'` + `images.unoptimized`; add `/mcp` rewrite.
- `apphosting.yaml` — env (build) + secret refs (runtime).
- `firebase.json` — remove hosting rewrites to functions + SPA fallback.
- `functions/index.js` — keep only `mcpServer` export.
- `firebaseConfig.ts` — drop Functions SDK.
- `lib/api-keys.ts` — `fetch` + Bearer ID token instead of `httpsCallable`.
- `lib/fetchVerse.ts` — drop emulator URL branch.
- `app/search/page.tsx` — drop emulator URL branch.
- `app/stories/page.tsx` — server component + metadata.
- `app/page.tsx` — server shell + `HomeRedirect` island.
- `app/developers/page.tsx` — public SSR docs + import auth island.
- `package.json` — add deps; replace deploy scripts.

**Untouched (MCP isolation):** everything under `functions/mcp/` and `functions/lib/` stays exactly as-is.

---

## Phase 1 — Foundation & Config

### Task 1: Add server-side dependencies to the root app

**Files:**
- Modify: `package.json` (dependencies block)

- [ ] **Step 1: Add the two missing server dependencies**

The Next.js server now needs `firebase-admin` (token verification, Firestore, Storage) and `@aws-sdk/client-bedrock-runtime` (embeddings). Run:

```bash
npm install firebase-admin@^12.7.0 @aws-sdk/client-bedrock-runtime@^3.750.0
```

- [ ] **Step 2: Verify they landed in dependencies (not devDependencies)**

Run: `node -e "const p=require('./package.json'); console.log(p.dependencies['firebase-admin'], p.dependencies['@aws-sdk/client-bedrock-runtime'])"`
Expected: prints two version strings, e.g. `^12.7.0 ^3.750.0`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: add firebase-admin and bedrock-runtime for server routes"
```

---

### Task 2: Switch Next.js config off static export and add the /mcp rewrite

**Files:**
- Modify: `next-config.js`

- [ ] **Step 1: Replace the config file contents**

Removing `output: 'export'` enables SSR + Route Handlers. Removing `images.unoptimized` enables Next image optimization on Cloud Run (keep `remotePatterns`). The `rewrites()` proxies `/mcp` to the unchanged Cloud Function so external clients keep using the apex `/mcp` path.

```js
/** @type {import('next').NextConfig} */
const MCP_FUNCTION_URL =
  process.env.MCP_FUNCTION_URL ||
  'https://us-central1-maktabah-8ac04.cloudfunctions.net/mcpServer';

const nextConfig = {
  experimental: {
    forceSwcTransforms: true,
  },
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/mcp',
        destination: MCP_FUNCTION_URL,
      },
      {
        source: '/mcp/:path*',
        destination: `${MCP_FUNCTION_URL}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

- [ ] **Step 2: Type/lint sanity check**

Run: `node -e "require('./next-config.js'); console.log('config loads')"`
Expected: `config loads` (no syntax error)

- [ ] **Step 3: Commit**

```bash
git add next-config.js
git commit -m "feat: enable SSR (remove static export) and proxy /mcp to function"
```

---

### Task 3: Server-side firebase-admin singleton

**Files:**
- Create: `lib/server/firebase-admin.ts`

- [ ] **Step 1: Create the admin singleton module**

In production on App Hosting, `initializeApp()` with no credentials uses Application Default Credentials and the Cloud Run service account. In local dev, the Auth/Firestore emulators are used automatically when their host env vars are set (`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`).

```ts
import {
  initializeApp,
  getApps,
  getApp,
  App,
} from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';

const STORAGE_BUCKET = 'maktabah-8ac04.firebasestorage.app';

export function getAdminApp(): App {
  if (getApps().length) {
    return getApp();
  }
  // No args: uses Application Default Credentials on App Hosting (Cloud Run).
  // In local dev, the *_EMULATOR_HOST env vars route admin to the emulators.
  return initializeApp({ storageBucket: STORAGE_BUCKET });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}

export { STORAGE_BUCKET };
```

- [ ] **Step 2: Document the local dev env vars (manual, do not auto-edit .env.local)**

Per AGENTS.md, do not overwrite `.env.local` programmatically. Tell the developer to add these lines manually (confirm first) for local route testing against emulators:

```
# Local dev only — route firebase-admin to the emulators
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8080
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/server/firebase-admin.ts`

- [ ] **Step 4: Commit**

```bash
git add lib/server/firebase-admin.ts
git commit -m "feat: add server-side firebase-admin singleton"
```

---

### Task 4: Configure apphosting.yaml (env + secrets)

**Files:**
- Modify: `apphosting.yaml`

- [ ] **Step 1: Replace apphosting.yaml with env + secret config**

`NEXT_PUBLIC_*` values are needed at BUILD time (inlined into the client bundle) and RUNTIME (read in server components like `layout.tsx`). They are non-secret, so use plain `value:` entries. The OpenSearch/AWS values are secrets → reference Cloud Secret Manager (`secret:`), RUNTIME only.

> Copy the actual `NEXT_PUBLIC_*` values from your local `.env.local` into the `value:` fields below. These are public Firebase web-config identifiers (safe to commit). Set `NEXT_PUBLIC_SITE_URL` to the production domain and `NEXT_PUBLIC_MCP_URL` to the apex `/mcp` path.

```yaml
runConfig:
  minInstances: 0
  cpu: 1
  memoryMiB: 512

env:
  # --- Public web config (BUILD + RUNTIME). Values copied from .env.local. ---
  - variable: NEXT_PUBLIC_FIREBASE_API_KEY
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_PROJECT_ID
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_APP_ID
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_MIXPANEL_TOKEN
    value: "<copy from .env.local>"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_SITE_URL
    value: "https://maktabah.app"
    availability: [BUILD, RUNTIME]
  - variable: NEXT_PUBLIC_MCP_URL
    value: "https://maktabah.app/mcp"
    availability: [BUILD, RUNTIME]

  # --- Server-only secrets (RUNTIME). Reference existing Secret Manager secrets. ---
  - variable: OPENSEARCH_URL
    secret: OPENSEARCH_URL
    availability: [RUNTIME]
  - variable: AWS_ACCESS_KEY_ID
    secret: AWS_ACCESS_KEY_ID
    availability: [RUNTIME]
  - variable: AWS_SECRET_ACCESS_KEY
    secret: AWS_SECRET_ACCESS_KEY
    availability: [RUNTIME]
  - variable: AWS_REGION
    value: "us-east-1"
    availability: [RUNTIME]
```

- [ ] **Step 2: Validate YAML parses**

Run: `node -e "const fs=require('fs');const s=fs.readFileSync('apphosting.yaml','utf8');console.log(s.includes('OPENSEARCH_URL')?'ok':'missing')"`
Expected: `ok`

(Granting the App Hosting backend service account access to the secrets happens in Phase 4, Task 21.)

- [ ] **Step 3: Commit**

```bash
git add apphosting.yaml
git commit -m "config: app hosting env + secret references"
```

---

### Task 5: Strip Firebase Hosting rewrites (App Hosting serves the app)

**Files:**
- Modify: `firebase.json`

- [ ] **Step 1: Remove the `hosting` block; keep functions/firestore/storage/emulators**

App Hosting serves all web traffic now, so the static `hosting` config (function rewrites + SPA fallback) is obsolete. The `functions` block stays so `mcpServer` can still be deployed.

```json
{
  "functions": {
    "source": "functions"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "firestore": {
    "rules": "firestore.rules"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "functions": {
      "port": 5001
    },
    "firestore": {
      "port": 8080
    }
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('firebase.json','utf8')); console.log('valid json')"`
Expected: `valid json`

- [ ] **Step 3: Commit**

```bash
git add firebase.json
git commit -m "config: remove Firebase Hosting rewrites (App Hosting serves the app)"
```

---

## Phase 2 — Backend → Next.js API Routes

### Task 6: Port the search core to TypeScript

**Files:**
- Create: `lib/server/search.ts`
- Reference (do not modify): `functions/lib/search-core.js`

- [ ] **Step 1: Create the search module (faithful port; `console` instead of functions logger)**

```ts
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const EMBEDDING_MODEL_ID = 'cohere.embed-multilingual-v3';
const OPENSEARCH_INDEX = 'kitaab';

let bedrockClient: BedrockRuntimeClient | undefined;
function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return bedrockClient;
}

let opensearchClient: Client | undefined;
function getOpenSearchClient(): Client {
  if (!opensearchClient) {
    opensearchClient = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'es',
        getCredentials: () =>
          Promise.resolve({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
          }),
      }),
      node: process.env.OPENSEARCH_URL as string,
    });
  }
  return opensearchClient;
}

async function embedQuery(text: string): Promise<number[]> {
  const client = getBedrockClient();
  const response = await client.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts: [text],
        input_type: 'search_query',
        truncate: 'END',
      }),
    })
  );
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embeddings[0];
}

function deduplicateResults(hits: any[]): any[] {
  const seen = new Map<string, any>();
  for (const hit of hits) {
    const s = hit._source;
    const key = `${s.title || 'unknown'}_${s.volume != null ? s.volume : 'noVolume'}_${s.chapter}_${s.verse}`;
    const score = hit._score || 0;
    if (!seen.has(key) || score > seen.get(key)._score) {
      seen.set(key, { ...hit, _score: score });
    }
  }
  return Array.from(seen.values()).map((hit) => ({
    id: hit._id,
    score: hit._score || 0,
    ...hit._source,
  }));
}

function reciprocalRankFusion(
  textHits: any[],
  knnHits: any[],
  k = 60,
  textWeight = 1.0,
  semanticWeight = 1.5
): any[] {
  const scores = new Map<string, { score: number; hit: any; sources: Set<string> }>();

  textHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) scores.set(key, { score: 0, hit, sources: new Set() });
    const entry = scores.get(key)!;
    entry.score += textWeight * (1 / (k + rank + 1));
    entry.sources.add('keyword');
  });

  knnHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) scores.set(key, { score: 0, hit, sources: new Set() });
    const entry = scores.get(key)!;
    entry.score += semanticWeight * (1 / (k + rank + 1));
    entry.sources.add('semantic');
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, hit, sources }) => {
      const source = sources.size === 2 ? 'both' : [...sources][0];
      return { ...hit, _score: score, _source: { ...hit._source, source } };
    });
}

async function fetchHighlights(query: string, results: any[]): Promise<Map<string, any>> {
  if (!results.length || !query) return new Map();
  const client = getOpenSearchClient();
  const docIds = results.map((r) => r.id);
  try {
    const response = await client.search({
      index: OPENSEARCH_INDEX,
      body: {
        size: docIds.length,
        query: {
          bool: {
            must: { ids: { values: docIds } },
            should: [{ match: { text: { query } } }],
          },
        },
        highlight: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fields: { text: { fragment_size: 0, number_of_fragments: 0 } },
        },
        _source: false,
      },
    });
    const highlightMap = new Map<string, any>();
    for (const hit of (response.body as any).hits.hits) {
      if (hit.highlight) highlightMap.set(hit._id, hit.highlight);
    }
    return highlightMap;
  } catch (error: any) {
    console.warn('Highlight fetch failed:', error?.message);
    return new Map();
  }
}

export interface SearchOptions {
  page?: number;
  size?: number;
  author?: string | null;
  chapter?: string | null;
  titles?: string | string[] | null;
  mode?: 'text' | 'semantic' | 'hybrid';
}

export async function searchDocuments(
  query: string,
  { page = 1, size = 10, author = null, chapter = null, titles = null, mode = 'hybrid' }: SearchOptions = {}
): Promise<any> {
  try {
    const client = getOpenSearchClient();
    const from = (page - 1) * size;

    const filters: any[] = [];
    if (author) filters.push({ term: { author } });
    if (chapter) filters.push({ term: { chapter: parseInt(chapter, 10) } });
    if (titles) {
      const titleArray = Array.isArray(titles) ? titles : [titles];
      if (titleArray.length > 0) filters.push({ terms: { title: titleArray } });
    }

    let searchResult: any;

    if (mode === 'text') {
      const searchQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { 'text.arabic': { query, boost: 1.2 } } },
          ],
          minimum_should_match: 1,
          filter: filters,
        },
      };

      const response = await client.search({
        index: OPENSEARCH_INDEX,
        body: {
          size: 0,
          query: searchQuery,
          aggs: {
            titles: {
              terms: { field: 'title', size: 100, order: { _key: 'asc' } },
              aggs: {
                volumes: {
                  terms: { field: 'volume', size: 100, order: { _key: 'asc' }, missing: -1 },
                  aggs: {
                    chapters: {
                      terms: { field: 'chapter', size: 1000, order: { _key: 'asc' } },
                      aggs: {
                        verses: {
                          terms: { field: 'verse', size: 1000, order: { _key: 'asc' } },
                          aggs: {
                            top_hit: { top_hits: { size: 1, sort: [{ _score: { order: 'desc' } }] } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const titleBuckets = (response.body as any).aggregations.titles.buckets || [];
      let allResults: any[] = [];
      titleBuckets.forEach((titleBucket: any) => {
        (titleBucket.volumes.buckets || []).forEach((volumeBucket: any) => {
          (volumeBucket.chapters.buckets || []).forEach((chapterBucket: any) => {
            (chapterBucket.verses.buckets || []).forEach((verseBucket: any) => {
              const topHit = verseBucket.top_hit.hits.hits[0];
              allResults.push({ id: topHit._id, score: topHit._score || 0, ...topHit._source });
            });
          });
        });
      });

      allResults.sort((a, b) => b.score - a.score);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else if (mode === 'semantic') {
      const embedding = await embedQuery(query);
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const finalQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const response = await client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: finalQuery } });
      const allResults = deduplicateResults((response.body as any).hits.hits);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else if (mode === 'hybrid') {
      const embedding = await embedQuery(query);
      const textQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { 'text.arabic': { query, boost: 1.2 } } },
          ],
          minimum_should_match: 1,
          filter: filters,
        },
      };
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const knnQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const [textResponse, knnResponse] = await Promise.all([
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: textQuery } }),
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: knnQuery } }),
      ]);

      const mergedHits = reciprocalRankFusion(
        (textResponse.body as any).hits.hits,
        (knnResponse.body as any).hits.hits
      );
      const allResults = deduplicateResults(mergedHits);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else {
      return { results: [], total: 0, page, size, totalPages: 0, hasMore: false };
    }

    const highlightMap = await fetchHighlights(query, searchResult.results);
    searchResult.results = searchResult.results.map((result: any) => {
      const hl = highlightMap.get(result.id);
      if (hl) result.highlight = hl;
      return result;
    });

    return searchResult;
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/server/search.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/server/search.ts
git commit -m "feat: port OpenSearch/Bedrock search core to TS server module"
```

---

### Task 7: Search Route Handler + frontend cleanup

**Files:**
- Create: `app/api/search/route.ts`
- Modify: `app/search/page.tsx:65-77`

- [ ] **Step 1: Create the search route**

Mirrors the old `nextApiHandler` `/api/search` contract: validate `q` and `mode`, strip `source` from results unless `debug=true`. `force-dynamic` prevents static optimization; `nodejs` runtime is required for the OpenSearch/AWS SDKs.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/server/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get('q');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const size = parseInt(searchParams.get('size') || '10', 10);
  const author = searchParams.get('author');
  const chapter = searchParams.get('chapter');
  const titles = searchParams.getAll('title');
  const mode = (searchParams.get('mode') || 'hybrid') as 'text' | 'semantic' | 'hybrid';
  const debug = searchParams.get('debug') === 'true';

  if (!query) {
    return NextResponse.json({ error: 'Missing search query parameter (q)' }, { status: 400 });
  }
  if (!['text', 'semantic', 'hybrid'].includes(mode)) {
    return NextResponse.json(
      { error: 'Invalid mode. Use "text", "semantic", or "hybrid".' },
      { status: 400 }
    );
  }

  try {
    const searchResults = await searchDocuments(query, {
      page,
      size,
      author,
      chapter,
      titles: titles.length ? titles : null,
      mode,
    });

    if (!debug) {
      searchResults.results = searchResults.results.map(({ source, ...rest }: any) => rest);
    }

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Point the frontend at the relative route (drop emulator URL)**

In `app/search/page.tsx`, replace the `getApiUrl` callback (currently lines 65-77) with the version below. The dev-only `mode`/`debug` params are preserved; only the emulator base URL is removed.

```tsx
  // Get the appropriate API URL based on environment
  const getApiUrl = useCallback((q: string, p: number): string => {
    let url = `/api/search?q=${encodeURIComponent(q)}&page=${p}&size=10`;
    if (isDevelopment) {
      url += `&mode=${searchMode}&debug=true`;
    }
    return url;
  }, [isDevelopment, searchMode]);
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/api/search` appears in the route list as a dynamic (ƒ) route.

- [ ] **Step 4: Smoke-test the route locally**

In one terminal: `npm run dev`. In another (requires the OpenSearch/AWS secrets present in `.env.local`):

Run: `curl -s 'http://localhost:3000/api/search?q=mercy&size=2' | head -c 300`
Expected: JSON with `"total"`, `"results"` keys (HTTP 200). Also verify the error path:
Run: `curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:3000/api/search'`
Expected: `400`

- [ ] **Step 5: Commit**

```bash
git add app/api/search/route.ts app/search/page.tsx
git commit -m "feat: search Route Handler; frontend uses relative /api/search"
```

---

### Task 8: Storage proxy Route Handler + frontend cleanup

**Files:**
- Create: `app/api/storage/[...path]/route.ts`
- Modify: `lib/fetchVerse.ts`

- [ ] **Step 1: Create the storage proxy route**

Ports `proxyStorage`: downloads `{...path}.json` from the bucket via firebase-admin Storage, 404 if missing, 1-hour cache.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage, STORAGE_BUCKET } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = (params.path || []).join('/');
  if (!filePath) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  try {
    const bucket = getAdminStorage().bucket(STORAGE_BUCKET);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return new NextResponse('File not found', { status: 404 });
    }

    const [fileContent] = await file.download();
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error proxying file from Storage:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
```

- [ ] **Step 2: Simplify `lib/fetchVerse.ts` (drop emulator branches)**

Replace the whole file. Each function now uses the relative `/api/storage/...` path in all environments.

```ts
/**
 * Utility to fetch verses from Firebase Storage via the /api/storage proxy route.
 */

async function fetchStorageJson(apiPath: string) {
  const response = await fetch(`/${apiPath}`);
  if (!response.ok) {
    throw new Error(`Error fetching ${apiPath}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchVerse(bookId: string, chapter: number, verse: number) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/${chapter}/${verse}.json`);
  } catch (error) {
    console.error('Error fetching verse:', error);
    throw error;
  }
}

export async function fetchChapter(bookId: string, chapter: number) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/${chapter}/chapter.json`);
  } catch (error) {
    console.error('Error fetching chapter:', error);
    throw error;
  }
}

export async function fetchBookMetadata(bookId: string) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/book.json`);
  } catch (error) {
    console.error('Error fetching book metadata:', error);
    throw error;
  }
}
```

- [ ] **Step 3: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/api/storage/[...path]` appears as a dynamic route.

- [ ] **Step 4: Smoke-test (emulators running + Firestore/Storage data, OR against a known file)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:3000/api/storage/does/not/exist.json'`
Expected: `404`

- [ ] **Step 5: Commit**

```bash
git add 'app/api/storage/[...path]/route.ts' lib/fetchVerse.ts
git commit -m "feat: storage proxy Route Handler; relative fetchVerse paths"
```

---

### Task 9: API-key server helpers (hashing, key gen, auth) + usage

**Files:**
- Create: `lib/server/api-keys.ts`
- Create: `lib/server/usage.ts`
- Reference (do not modify): `functions/lib/api-key-auth.js`, `functions/lib/usage-tracking.js`

- [ ] **Step 1: Create `lib/server/api-keys.ts`**

`requireUser` replaces the callable `request.auth` — it verifies the Firebase ID token from the `Authorization: Bearer` header and returns the uid (throwing `AuthError` with a status code on failure).

```ts
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { getAdminAuth } from '@/lib/server/firebase-admin';

export class AuthError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateRawApiKey(): string {
  const bytes = crypto.randomBytes(32);
  return `mk_${bytes.toString('base64url')}`;
}

/**
 * Verify the Firebase ID token on the request and return the caller's uid.
 * @throws AuthError(401) when the header is missing or the token is invalid.
 */
export async function requireUser(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError(401, 'Must be logged in');
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new AuthError(401, 'Must be logged in');
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    throw new AuthError(401, 'Invalid authentication token');
  }
}
```

- [ ] **Step 2: Create `lib/server/usage.ts` (port of `getUsageData`)**

```ts
import { getAdminDb } from '@/lib/server/firebase-admin';

export interface DailyUsage {
  date: string;
  requests: number;
  tools: Record<string, number>;
}

export async function getUsageData(keyHash: string, days = 7): Promise<DailyUsage[]> {
  const db = getAdminDb();

  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const snapshot = await db
    .collection('apiKeys')
    .doc(keyHash)
    .collection('usage')
    .where('date', 'in', dates.slice(0, 10))
    .get();

  const usageMap = new Map<string, DailyUsage>();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    usageMap.set(data.date, {
      date: data.date,
      requests: data.requests || 0,
      tools: data.tools || {},
    });
  });

  return dates
    .map((date) => usageMap.get(date) || { date, requests: 0, tools: {} })
    .reverse();
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add lib/server/api-keys.ts lib/server/usage.ts
git commit -m "feat: server helpers for API-key hashing, auth, and usage"
```

---

### Task 10: `/api/keys` route — list (GET) + generate (POST)

**Files:**
- Create: `app/api/keys/route.ts`

- [ ] **Step 1: Create the route**

Preserves the exact logic from the callable `listApiKeys` (GET) and `generateApiKey` (POST): max 5 active keys, name required and ≤100 chars, dual-write to `apiKeys/{hash}` and `users/{uid}/apiKeys/{hash}`, return the raw key once.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, hashApiKey, generateRawApiKey, AuthError } from '@/lib/server/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const uid = await requireUser(req);
    const db = getAdminDb();
    const snapshot = await db
      .collection('users')
      .doc(uid)
      .collection('apiKeys')
      .orderBy('createdAt', 'desc')
      .get();

    const keys = snapshot.docs.map((doc) => ({
      keyId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('listApiKeys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'API key name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: 'API key name must be 100 characters or less' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    const existingKeys = await db
      .collection('users')
      .doc(uid)
      .collection('apiKeys')
      .where('status', '==', 'active')
      .get();
    if (existingKeys.size >= 5) {
      return NextResponse.json(
        { error: 'Maximum of 5 active API keys allowed' },
        { status: 429 }
      );
    }

    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 7) + '...' + rawKey.slice(-4);
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
    batch.set(db.collection('apiKeys').doc(keyHash), {
      uid,
      name,
      keyPrefix,
      createdAt: now,
      lastUsedAt: null,
      requestCount: 0,
      rateLimit: 30,
      status: 'active',
    });
    batch.set(db.collection('users').doc(uid).collection('apiKeys').doc(keyHash), {
      keyPrefix,
      name,
      createdAt: now,
      status: 'active',
    });
    await batch.commit();

    return NextResponse.json({ key: rawKey, keyId: keyHash, name, keyPrefix });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('generateApiKey error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/api/keys` listed as dynamic route.

- [ ] **Step 3: Verify auth rejection (no token → 401)**

With `npm run dev` running:
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/keys`
Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add 'app/api/keys/route.ts'
git commit -m "feat: /api/keys GET (list) + POST (generate) routes"
```

---

### Task 11: `/api/keys/[keyId]` route — revoke (DELETE)

**Files:**
- Create: `app/api/keys/[keyId]/route.ts`

- [ ] **Step 1: Create the route**

Preserves `revokeApiKey`: verify ownership, reject already-revoked, dual-update status to `revoked`.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, AuthError } from '@/lib/server/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const uid = await requireUser(req);
    const keyId = params.keyId;
    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const keyDoc = await db.collection('apiKeys').doc(keyId).get();
    if (!keyDoc.exists || keyDoc.data()?.uid !== uid) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }
    if (keyDoc.data()?.status === 'revoked') {
      return NextResponse.json({ error: 'API key is already revoked' }, { status: 409 });
    }

    const batch = db.batch();
    batch.update(db.collection('apiKeys').doc(keyId), { status: 'revoked' });
    batch.update(db.collection('users').doc(uid).collection('apiKeys').doc(keyId), {
      status: 'revoked',
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('revokeApiKey error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/api/keys/[keyId]` listed as dynamic route.

- [ ] **Step 3: Verify auth rejection**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X DELETE http://localhost:3000/api/keys/abc`
Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add 'app/api/keys/[keyId]/route.ts'
git commit -m "feat: /api/keys/[keyId] DELETE (revoke) route"
```

---

### Task 12: `/api/keys/[keyId]/usage` route — usage (GET)

**Files:**
- Create: `app/api/keys/[keyId]/usage/route.ts`

- [ ] **Step 1: Create the route**

Preserves `getApiKeyUsage`: clamp `days` to 1–10, verify ownership, return key stats + daily usage.

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, AuthError } from '@/lib/server/api-keys';
import { getUsageData } from '@/lib/server/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const uid = await requireUser(req);
    const keyId = params.keyId;
    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);
    const days = Math.min(Math.max(Number.isNaN(daysParam) ? 7 : daysParam, 1), 10);

    const db = getAdminDb();
    const keyDoc = await db.collection('apiKeys').doc(keyId).get();
    if (!keyDoc.exists || keyDoc.data()?.uid !== uid) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    const keyData = keyDoc.data()!;
    const usage = await getUsageData(keyId, days);

    return NextResponse.json({
      keyId,
      requestCount: keyData.requestCount || 0,
      lastUsedAt: keyData.lastUsedAt?.toDate?.()?.toISOString() || null,
      rateLimit: keyData.rateLimit || 30,
      usage,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('getApiKeyUsage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds; `/api/keys/[keyId]/usage` listed as dynamic route.

- [ ] **Step 3: Verify auth rejection**

Run: `curl -s -o /dev/null -w "%{http_code}\n" 'http://localhost:3000/api/keys/abc/usage?days=7'`
Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add 'app/api/keys/[keyId]/usage/route.ts'
git commit -m "feat: /api/keys/[keyId]/usage GET route"
```

---

### Task 13: Frontend API-key client → fetch + Bearer token; drop Functions SDK

**Files:**
- Modify: `lib/api-keys.ts`
- Modify: `firebaseConfig.ts`

- [ ] **Step 1: Rewrite `lib/api-keys.ts` to call the new routes with an ID token**

Each call attaches the current user's Firebase ID token as a Bearer header and maps non-2xx responses to thrown `Error`s (matching the prior callable behavior the UI expects).

```ts
import { auth } from '@/firebaseConfig';
import { ApiKey, GenerateApiKeyResponse, ApiKeyUsageResponse } from '@/types';

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be logged in');
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parseError(res: Response): Promise<never> {
  let message = 'Request failed';
  try {
    const data = await res.json();
    message = data.error || message;
  } catch {
    /* non-JSON error body */
  }
  throw new Error(message);
}

export async function generateApiKey(name: string): Promise<GenerateApiKeyResponse> {
  const res = await fetch('/api/keys', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`/api/keys/${keyId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) return parseError(res);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await fetch('/api/keys', { headers: await authHeaders() });
  if (!res.ok) return parseError(res);
  const data = await res.json();
  return data.keys;
}

export async function getApiKeyUsage(keyId: string, days: number = 7): Promise<ApiKeyUsageResponse> {
  const res = await fetch(`/api/keys/${keyId}/usage?days=${days}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}
```

- [ ] **Step 2: Remove the Functions SDK from `firebaseConfig.ts`**

No callable functions remain, so drop `getFunctions`/`connectFunctionsEmulator` and the `functions` export. Replace the file with:

```ts
// Firebase configuration for client-side usage
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let firebaseApp: FirebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

const auth: Auth = getAuth(firebaseApp);
const db: Firestore = getFirestore(firebaseApp);

// Connect to emulators in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const w = window as any;
  if (!w._emulatorConnected) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    w._emulatorConnected = true;
  }
}

export { auth, firebaseApp, db };
```

- [ ] **Step 3: Confirm nothing else imports `functions` from firebaseConfig**

Run: `grep -rn "functions" firebaseConfig.ts; grep -rn "from '@/firebaseConfig'" app lib | grep -i function`
Expected: no remaining references to a `functions` export.

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual end-to-end check (emulators running)**

Start emulators (`npm run functions`) and `npm run dev`. Sign in, open `/developers`, generate a key, view its usage, revoke it. Confirm each operation works against the new routes (watch the Network tab hit `/api/keys*`).

- [ ] **Step 6: Commit**

```bash
git add lib/api-keys.ts firebaseConfig.ts
git commit -m "feat: API-key client uses fetch + ID token; drop Functions SDK"
```

---

### Task 14: Slim `functions/index.js` to only the MCP server

**Files:**
- Modify: `functions/index.js`

- [ ] **Step 1: Remove the migrated functions; keep `mcpServer` (and its shared libs untouched)**

Replace the file with the MCP-only version. `proxyStorage`, `nextApiHandler`, and the 4 callable functions are now Next.js routes.

```js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { handleMcpRequest } = require('./mcp/handler');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// --- MCP Server ---
exports.mcpServer = functions.https.onRequest(
  {
    timeoutSeconds: 300,
    minInstances: 0,
    secrets: ['OPENSEARCH_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
  async (req, res) => {
    await handleMcpRequest(req, res);
  }
);
```

- [ ] **Step 2: Confirm the MCP handler chain is intact**

Run: `node -e "require('./functions/mcp/handler.js'); console.log('mcp handler loads')"`
Expected: `mcp handler loads` (verifies the untouched MCP code still resolves its requires).

- [ ] **Step 3: Commit**

```bash
git add functions/index.js
git commit -m "refactor: functions now expose only mcpServer (rest moved to Next.js)"
```

---

## Phase 3 — SSR Page Conversions

### Task 15: `/stories` as a server component with metadata

**Files:**
- Modify: `app/stories/page.tsx`

- [ ] **Step 1: Convert the page to a server component**

A `'use client'` page cannot export `metadata` — that is the concrete SEO blocker. Remove the client directive and add page metadata; `StoriesList` stays a client island (it renders server-side HTML on first load and only needs the client for click tracking).

```tsx
import React from 'react';
import type { Metadata } from 'next';
import StoriesList from '@/app/components/StoriesList';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  title: 'Quranic Stories',
  description:
    'Explore the profound stories from the Quran — the Prophets and key figures — each curated with relevant verses and context.',
  alternates: { canonical: `${siteUrl}/stories` },
  openGraph: {
    title: 'Quranic Stories - Maktabah',
    description:
      'Explore the profound stories from the Quran, each curated with relevant verses and context.',
    type: 'website',
    url: `${siteUrl}/stories`,
  },
};

export default function StoriesPage() {
  return (
    <div className="pb-8">
      <h1 className="text-3xl font-bold text-center text-primary mb-6 pt-8">Quranic Stories</h1>

      <div className="container mx-auto px-4">
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Explore the profound stories from the Quran. Each story is curated with relevant verses and context to help you understand the narrative better.
        </p>

        <div className="flex justify-center">
          <StoriesList source="stories_page" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build + verify SSR content and metadata**

Run: `npm run build && npm run start` (start serves the production build on :3000). Then:
Run: `curl -s http://localhost:3000/stories | grep -c "Explore Our Stories"`
Expected: `1` or more (story list HTML is server-rendered).
Run: `curl -s http://localhost:3000/stories | grep -o "<title>[^<]*</title>"`
Expected: a title containing `Quranic Stories`.

- [ ] **Step 3: Commit**

```bash
git add app/stories/page.tsx
git commit -m "feat: SSR /stories with page metadata"
```

---

### Task 16: Home as a server shell + client redirect island

**Files:**
- Create: `app/components/HomeRedirect.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Create the redirect island**

The only client-side behavior on home is "redirect signed-in users to /search." Extract it so the page can be a server component.

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function HomeRedirect(): null {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/search');
    }
  }, [user, loading, router]);

  return null;
}
```

- [ ] **Step 2: Make `app/page.tsx` a server component**

`HomeContent` stays a client component (it uses `useAuth`/sign-in) but renders to server HTML for crawlers. The page itself is now a server component hosting the content + the redirect island.

```tsx
import React from 'react';
import HomeContent from './components/HomeContent';
import HomeRedirect from './components/HomeRedirect';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      <HomeRedirect />
      <HomeContent />
    </div>
  );
}
```

- [ ] **Step 3: Build + verify**

Run: `npm run build && npm run start`, then:
Run: `curl -s http://localhost:3000/ | grep -c "Your Gateway to Islamic Knowledge"`
Expected: `1` or more (home content server-rendered).

- [ ] **Step 4: Commit**

```bash
git add app/components/HomeRedirect.tsx app/page.tsx
git commit -m "feat: SSR home shell with client redirect island"
```

---

### Task 17: Verify `/story/[name]` renders under SSR (no static-export constraints)

**Files:**
- Verify: `app/story/[name]/page.tsx` (no code change expected)

- [ ] **Step 1: Build and confirm story pages prerender**

`generateStaticParams` + `dynamicParams = false` are valid under App Hosting (SSG at build, 404 for unknown names) and need no change. Confirm:
Run: `npm run build`
Expected: build output lists `/story/[name]` as a prerendered/SSG route for the 13 allowed stories.

- [ ] **Step 2: Verify a story renders with metadata + JSON-LD**

Run: `npm run start`, then:
Run: `curl -s http://localhost:3000/story/yusuf | grep -o "application/ld+json"`
Expected: `application/ld+json` (structured data present).
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/story/not-a-real-story`
Expected: `404`

- [ ] **Step 3: No commit needed unless a change was required**

If the build surfaced an export-only issue, fix it minimally and commit:
```bash
git add app/story/[name]/page.tsx && git commit -m "fix: story page SSR compatibility"
```
Otherwise skip.

---

### Task 18: Split `/developers` into public SSR docs + auth-gated keys island

**Files:**
- Create: `app/developers/DevelopersKeysClient.tsx`
- Modify: `app/developers/page.tsx`

**Why:** today the entire page is wrapped in `ProtectedRoute`, so unauthenticated crawlers see nothing. Moving the docs (MCP endpoint, config snippet, tools, recommended prompt) into an SSR server component — with only the API-keys table behind `ProtectedRoute` — makes the docs indexable.

- [ ] **Step 1: Create the auth-gated keys island**

This holds everything that needs login: the keys table, generate form, usage panels, and the new-key modal. Move that logic out of the page verbatim (the existing `CopyButton`, `NewKeyModal`, `UsageBar`, `UsagePanel`, and `DevelopersPageContent` table/form code), exposing a single default export wrapped in `ProtectedRoute`.

```tsx
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { generateApiKey, revokeApiKey, listApiKeys, getApiKeyUsage } from '@/lib/api-keys';
import { ApiKey, GenerateApiKeyResponse, ApiKeyUsageResponse } from '@/types';
import { FiCopy, FiCheck, FiTrash2, FiPlus, FiKey, FiAlertCircle, FiChevronDown, FiChevronRight } from 'react-icons/fi';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center space-x-1 text-sm text-primary hover:text-primary-dark transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  );
}

function NewKeyModal({ apiKey, onClose }: { apiKey: GenerateApiKeyResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center space-x-2 mb-4">
          <FiAlertCircle size={20} className="text-amber-500" />
          <h3 className="text-lg font-semibold">Save your API key</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          This is the only time your full API key will be shown. Copy it now and store it securely.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
          <div className="flex items-center justify-between">
            <code className="text-sm font-mono break-all">{apiKey.key}</code>
            <button onClick={handleCopy} className="ml-3 flex-shrink-0 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">Key name: <span className="font-medium">{apiKey.name}</span></p>
        <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">Done</button>
      </div>
    </div>
  );
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{value}</span>
    </div>
  );
}

function UsagePanel({ keyId }: { keyId: string }) {
  const [usage, setUsage] = useState<ApiKeyUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getApiKeyUsage(keyId, 7).then(setUsage).catch(() => {}).finally(() => setLoading(false));
  }, [keyId]);
  if (loading) {
    return <div className="py-4 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary" /></div>;
  }
  if (!usage) return <p className="text-sm text-gray-500 py-2">Failed to load usage data.</p>;
  const maxRequests = Math.max(...usage.usage.map((d) => d.requests), 1);
  const toolTotals: Record<string, number> = {};
  usage.usage.forEach((day) => {
    Object.entries(day.tools).forEach(([tool, count]) => {
      toolTotals[tool] = (toolTotals[tool] || 0) + count;
    });
  });
  const sortedTools = Object.entries(toolTotals).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500"><span>Total requests</span><span className="font-medium text-gray-900">{usage.requestCount.toLocaleString()}</span></div>
        <div className="flex justify-between text-xs text-gray-500"><span>Rate limit</span><span className="font-medium text-gray-900">{usage.rateLimit} req/min</span></div>
        <div className="flex justify-between text-xs text-gray-500"><span>Last used</span><span className="font-medium text-gray-900">{usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleDateString() : 'Never'}</span></div>
        {sortedTools.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">Tools (7 days)</p>
            {sortedTools.map(([tool, count]) => (
              <div key={tool} className="flex justify-between text-xs text-gray-500"><code className="text-xs font-mono">{tool}</code><span>{count}</span></div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Requests (last 7 days)</p>
        <div className="space-y-1">
          {usage.usage.map((day) => (
            <div key={day.date} className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 w-10 flex-shrink-0">{new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <div className="flex-1"><UsageBar value={day.requests} max={maxRequests} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<GenerateApiKeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await listApiKeys());
    } catch (err: any) {
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateApiKey(name);
      setNewKey(result);
      setNewKeyName('');
      await loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to generate API key');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    setRevokingId(keyId);
    setError(null);
    try {
      await revokeApiKey(keyId);
      await loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">API Keys</h2>
      <form onSubmit={handleGenerate} className="flex items-center space-x-3 mb-4">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. Claude Desktop)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          maxLength={100}
          required
        />
        <button
          type="submit"
          disabled={generating || !newKeyName.trim()}
          className="inline-flex items-center space-x-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiPlus size={16} />
          <span>{generating ? 'Generating...' : 'Generate'}</span>
        </button>
      </form>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" /></div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 text-gray-500"><FiKey size={32} className="mx-auto mb-2 text-gray-300" /><p>No API keys yet. Generate one to get started.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Key</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Created</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Status</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const isExpanded = key.status === 'active' && !collapsedKeys.has(key.keyId);
                const toggleExpanded = () => {
                  setCollapsedKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(key.keyId)) next.delete(key.keyId);
                    else next.add(key.keyId);
                    return next;
                  });
                };
                return (
                  <React.Fragment key={key.keyId}>
                    <tr className={`border-b border-gray-100 ${key.status === 'revoked' ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`} onClick={() => key.status === 'active' && toggleExpanded()}>
                      <td className="py-3 px-2 font-medium text-gray-900">
                        <span className="inline-flex items-center space-x-1">
                          {key.status === 'active' && (isExpanded ? <FiChevronDown size={14} className="text-gray-400" /> : <FiChevronRight size={14} className="text-gray-400" />)}
                          <span>{key.name}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2"><code className="text-xs font-mono text-gray-500">{key.keyPrefix}</code></td>
                      <td className="py-3 px-2 text-gray-500">{key.createdAt ? new Date(key.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="py-3 px-2">
                        {key.status === 'active' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Revoked</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {key.status === 'active' && (
                          <button onClick={(e) => { e.stopPropagation(); handleRevoke(key.keyId); }} disabled={revokingId === key.keyId} className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors" title="Revoke key">
                            <FiTrash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr><td colSpan={5} className="px-2 bg-gray-50 border-b border-gray-100"><UsagePanel keyId={key.keyId} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newKey && <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

export default function DevelopersKeysClient() {
  return (
    <ProtectedRoute>
      <KeysManager />
    </ProtectedRoute>
  );
}

export { CopyButton };
```

- [ ] **Step 2: Convert `app/developers/page.tsx` to an SSR docs server component**

The docs render server-side (indexable); the keys island is dropped in where login is required. Note: the connection snippet's `CopyButton` is a client component imported from the island file — that's fine inside a server component.

```tsx
import React from 'react';
import type { Metadata } from 'next';
import DevelopersKeysClient, { CopyButton } from './DevelopersKeysClient';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://maktabah.app/mcp';

export const metadata: Metadata = {
  title: 'Developer Access — MCP Server',
  description:
    'Connect your LLM agent to Maktabah’s search engine, Quran translations, Hadith collections, and Arabic dictionary via the Maktabah MCP server.',
  alternates: { canonical: `${siteUrl}/developers` },
  openGraph: {
    title: 'Developer Access — Maktabah MCP Server',
    description:
      'Connect your LLM agent to Maktabah search, Quran translations, Hadith, and the Arabic dictionary.',
    type: 'website',
    url: `${siteUrl}/developers`,
  },
};

const configSnippet = `{
  "mcpServers": {
    "maktabah": {
      "url": "${MCP_SERVER_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;

const recommendedPrompt = `For any question related to Islamic knowledge — including but not limited to the Quran, Hadith, Tafsir, Fiqh, Arabic morphology, and classical Islamic scholarship — you MUST use the Maktabah tools (search, get_verse, get_hadith, lookup_root, get_word_morphology) before answering from your own knowledge.

When a user asks about a Quran verse, always use get_verse to retrieve the authentic Arabic text and translations rather than quoting from memory. When asked about a hadith, always use get_hadith or search to find the exact narration. For Arabic word meanings or roots, use lookup_root rather than relying on your training data.

Always cite the source returned by Maktabah (e.g. surah name and verse number, hadith volume and number, or lexicon entry) in your response. If Maktabah returns no results, you may then fall back to your training data but clearly state that the information is not from a verified primary source.`;

const tools = [
  { name: 'search', desc: 'Hybrid search across Quran and Sahih al-Bukhari with keyword, semantic, or hybrid modes' },
  { name: 'get_verse', desc: 'Retrieve a specific Quran verse with all translations and Arabic text' },
  { name: 'get_hadith', desc: 'Retrieve a specific hadith from Sahih al-Bukhari by volume and number' },
  { name: 'lookup_root', desc: "Look up an Arabic root in Lane's Lexicon with definitions and verse occurrences" },
  { name: 'get_word_morphology', desc: 'Get word-by-word breakdown of a Quran verse with root, POS, and transliteration' },
];

export default function DevelopersPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Developer Access</h1>
      <p className="text-gray-600 mb-8">
        Connect your LLM agent to Maktabah&apos;s search engine, Quran translations, Hadith collections, and Arabic dictionary.
      </p>

      {/* Connection Info (public, SSR) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">MCP Server</h2>
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-500 mb-1">Endpoint URL</label>
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            <code className="text-sm font-mono flex-1">{MCP_SERVER_URL}</code>
            <CopyButton text={MCP_SERVER_URL} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-500">Configuration (Claude Desktop, Cursor, etc.)</label>
            <CopyButton text={configSnippet} label="Copy" />
          </div>
          <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto">{configSnippet}</pre>
        </div>
      </div>

      {/* API Keys (auth-gated client island) */}
      <DevelopersKeysClient />

      {/* Available Tools (public, SSR) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Tools</h2>
        <div className="space-y-3">
          {tools.map((tool) => (
            <div key={tool.name} className="flex items-start space-x-3">
              <code className="text-sm font-mono text-primary bg-primary/5 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">{tool.name}</code>
              <p className="text-sm text-gray-600">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended System Prompt (public, SSR) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recommended System Prompt</h2>
          <CopyButton text={recommendedPrompt} label="Copy" />
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Add this to your LLM&apos;s system prompt to ensure it prioritizes Maktabah&apos;s sourced data over its training data for Islamic knowledge queries.
        </p>
        <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto whitespace-pre-wrap">{recommendedPrompt}</pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build + verify docs are server-rendered while keys stay gated**

Run: `npm run build && npm run start`, then:
Run: `curl -s http://localhost:3000/developers | grep -c "Available Tools"`
Expected: `1` or more (docs SSR, visible without auth).
Run: `curl -s http://localhost:3000/developers | grep -c "mcpServers"`
Expected: `1` or more (config snippet present in HTML).

- [ ] **Step 4: Manual check that key management still works for signed-in users**

With emulators + `npm run dev`, sign in, open `/developers`, and confirm the API Keys section appears and generate/usage/revoke work.

- [ ] **Step 5: Commit**

```bash
git add app/developers/DevelopersKeysClient.tsx app/developers/page.tsx
git commit -m "feat: SSR developer docs; API keys as auth-gated island"
```

---

## Phase 4 — Deploy & Cutover

### Task 19: Replace obsolete build/deploy scripts

**Files:**
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Update scripts for the App Hosting world**

The old `build:firebase` (copy `.next` into `functions/`) and `deploy:hosting` flows are obsolete. Keep `prebuild` (sitemap), standard `build`, and a dedicated MCP deploy. Replace the `scripts` block's relevant entries:

```json
  "scripts": {
    "dev": "next dev",
    "prebuild": "node scripts/generate-sitemap.js",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "functions": "npm run serve -w maktabah-functions",
    "functions:logs": "npm run logs -w maktabah-functions",
    "deploy:mcp": "firebase deploy --only functions:mcpServer",
    "loader:load-opensearch": "node quran_loader/load-quran-to-search.js",
    "loader:search": "node quran_loader/search-opensearch.js",
    "loader:load-storage": "npm run loader:load-storage -w quran-opensearch-loader",
    "loader:reorder": "npm run loader:reorder -w quran-opensearch-loader",
    "loader:decode": "npm run loader:decode -w quran-opensearch-loader",
    "loader:generate-quran": "node quran_loader/generate-quran-json.js"
  },
```

- [ ] **Step 2: Validate JSON + that the sitemap prebuild still runs**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('valid')"`
Expected: `valid`
Run: `npm run prebuild`
Expected: `Sitemap written to .../public/sitemap.xml`

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: App Hosting build scripts; deploy:mcp for the function"
```

---

### Task 20: Deploy the MCP function standalone and confirm it still works

**Files:**
- None (deploy + verify)

- [ ] **Step 1: Deploy only the MCP function**

The slimmed `functions/index.js` exports only `mcpServer`. Deploying removes the now-migrated functions from the project.

Run: `npm run deploy:mcp`
Expected: deploy succeeds; CLI reports `mcpServer` updated. (If prompted to delete `nextApiHandler`, `proxyStorage`, `generateApiKey`, `revokeApiKey`, `listApiKeys`, `getApiKeyUsage`, confirm yes — they are now Next.js routes.)

- [ ] **Step 2: Smoke-test the function URL directly (auth required → expect 401 without a key)**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST https://us-central1-maktabah-8ac04.cloudfunctions.net/mcpServer -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
Expected: `401` (auth middleware rejects requests without a valid API key — confirms the function is up and unchanged).

- [ ] **Step 3: No commit (deploy action only)**

---

### Task 21: Connect App Hosting, grant secret access, first rollout

**Files:**
- None (Firebase console / CLI setup)

- [ ] **Step 1: Create the App Hosting backend connected to the GitHub repo**

In the Firebase console → App Hosting → "Get started": connect the GitHub repository, choose the production branch (e.g. `main`), and set the live branch so pushes auto-deploy. (Region: `us-central1` to match the function.) This reads `apphosting.yaml` for env/secrets.

- [ ] **Step 2: Grant the backend service account access to the secrets**

The runtime secrets referenced in `apphosting.yaml` must be readable by the App Hosting backend. Run (Firebase CLI):

```bash
firebase apphosting:secrets:grantaccess OPENSEARCH_URL --backend <backend-id>
firebase apphosting:secrets:grantaccess AWS_ACCESS_KEY_ID --backend <backend-id>
firebase apphosting:secrets:grantaccess AWS_SECRET_ACCESS_KEY --backend <backend-id>
```

Expected: each command reports access granted. (Replace `<backend-id>` with the backend created in Step 1.)

- [ ] **Step 3: Trigger the first rollout**

Merge/push the feature branch to the production branch to trigger an automatic build + rollout, or trigger a manual rollout from the console. Watch the build logs for a successful `next build` and a healthy Cloud Run revision.

Expected: rollout completes; the App Hosting URL serves the site.

- [ ] **Step 4: No commit (infra setup)**

---

### Task 22: Production smoke verification

**Files:**
- None (verification against the deployed App Hosting URL)

Use the live App Hosting domain (call it `$BASE`, e.g. `https://maktabah.app`).

- [ ] **Step 1: SSR pages render server-side with metadata**

Run: `curl -s "$BASE/stories" | grep -c "Explore Our Stories"` → Expected: ≥ 1
Run: `curl -s "$BASE/story/yusuf" | grep -o "application/ld+json"` → Expected: `application/ld+json`
Run: `curl -s "$BASE/developers" | grep -c "Available Tools"` → Expected: ≥ 1

- [ ] **Step 2: Search API works end-to-end**

Run: `curl -s "$BASE/api/search?q=mercy&size=2" | head -c 200`
Expected: JSON with `total`/`results` (confirms OpenSearch secrets resolved at runtime).

- [ ] **Step 3: MCP proxy works through the apex domain**

Run: `curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
Expected: `401` (request reaches the function via the rewrite; auth rejects without a key). Then with a valid API key:
Run: `curl -s -X POST "$BASE/mcp" -H "Content-Type: application/json" -H "Authorization: Bearer <valid-mk-key>" -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | head -c 200`
Expected: a JSON-RPC result listing tools (confirms streaming proxy works end-to-end).
**Fallback:** if the streamed response fails through the rewrite, switch to the dedicated-URL approach — set `NEXT_PUBLIC_MCP_URL` and the developers-page default to the function URL (or an `mcp.maktabah.app` custom domain) and remove the `/mcp` rewrite.

- [ ] **Step 4: Auth-gated key management works in the browser**

Sign in on `$BASE/developers`, generate a key, view usage, revoke it. Confirm Network calls hit `/api/keys*` and succeed.

- [ ] **Step 5: Secrets are not in the client bundle**

Run: `curl -s "$BASE/api/search?q=test&size=1" >/dev/null` then inspect a page's JS — confirm no `OPENSEARCH_URL`/AWS values appear:
Run: `curl -s "$BASE/" | grep -ci "AKIA" ` → Expected: `0` (no AWS access-key id leaked).

- [ ] **Step 6: Tag the completed migration**

```bash
git tag app-hosting-cutover && git push --tags
```

---

## Self-Review Notes (author checklist — already applied)

- **Spec coverage:** App Hosting (T2,T4,T21) · functions→routes: search (T6,T7), storage (T8), keys (T9–T13), MCP stays + proxy (T2,T14,T20,T22) · SSR pages: stories (T15), home (T16), story (T17), developers split (T18), quran (unchanged, noted) · secrets server-side (T4,T22) · GitHub deploy (T19,T21) · firebaseConfig/cleanup (T13) · scripts (T19).
- **Type consistency:** `searchDocuments(query, opts)`, `requireUser(req)→uid`, `hashApiKey`/`generateRawApiKey`, `getUsageData(keyHash, days)`, `getAdminDb/Auth/Storage`, `STORAGE_BUCKET`, `CopyButton` export — names match across tasks.
- **Response shapes** preserved from the callable/HTTP originals (keys list/generate/revoke/usage; search debug stripping; storage 404 + cache header).
- **Risk control:** prod untouched until Phase 4; MCP code under `functions/mcp/` and `functions/lib/` never modified.
