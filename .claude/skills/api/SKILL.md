---
name: api developer
description: Updates the firebase functions. Use when there are changes required for the backend, like new api functions or updates to old endpoints, to support the frontend and business needs
---

## Architecture Overview

This app uses **Next.js with static export** (`output: 'export'` in `next-config.js`) deployed to **Firebase Hosting**. All dynamic/server behavior lives in **Firebase Cloud Functions** (in `/functions`). There is no SSR — the frontend is a client-side SPA that calls Cloud Functions for data.

- Firebase Hosting serves the static build and rewrites `/api/**` paths to Cloud Functions (see `firebase.json`).
- Cloud Functions code lives in `/functions/index.js` (single file, plain JS with `firebase-functions`).
- Secrets (e.g. ElasticSearch credentials) are managed via Firebase Functions secrets, not env files.

## Current Cloud Functions

1. **`nextApiHandler`** — Handles `/api/search` requests. Queries ElasticSearch (`kitaab` index) with Arabic text search, author/chapter/title filtering, and chapter-verse aggregation. Uses secrets: `ELASTICSEARCH_URL`, `ELASTICSEARCH_APIKEY`.

2. **`proxyStorage`** — Handles `/api/storage/**` requests. Proxies file downloads from Firebase Storage bucket (`maktabah-8ac04.firebasestorage.app`) to avoid CORS issues. Read-only (GET only).

## Adding New API Endpoints

- Add new routes inside the existing `nextApiHandler` function by adding `if (req.path.startsWith('/api/yourRoute'))` blocks, OR export a new function and add a corresponding rewrite in `firebase.json`.
- **Dev vs Prod URLs:** In development (Firebase emulator), function URLs use the export name: `http://127.0.0.1:5001/maktabah-8ac04/us-central1/{functionExportName}`. In production, Firebase Hosting rewrites `/api/*` paths to the functions automatically.
- **CORS must be handled explicitly** in each function. Set headers and handle OPTIONS before processing:
  ```typescript
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  ```
- When adding a new top-level function, add a rewrite entry in `firebase.json` under `hosting.rewrites` (order matters — more specific paths go first).

## Deployment

```bash
npm run build:firebase    # Builds Next.js static export + copies .next to functions/
npm run deploy            # Full deploy (hosting + functions)
npm run deploy:hosting    # Deploy hosting only
npm run deploy:functions  # Deploy functions only
```

## Key Services

- **Firebase Auth** — Google Sign-in (client-side)
- **Firestore** — User bookmarks and notes
- **Firebase Storage** — Content files (accessed only via `proxyStorage` function)
- **ElasticSearch** — Full-text search with Arabic analyzer support
