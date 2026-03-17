---
name: api developer
description: Updates the firebase functions. Use when there are changes required for the backend, like new api functions or updates to old endpoints, to support the frontend and business needs
---

- Keep the Next.js UI as dumb as possible and keep all business logic and integrations into Cloud Functions.
- Code for functions are in the `/functions` folder.
- Refer and update `docs/architecture/cloud-functions.md` as changes to app occurs.
- Refer to `docs/business/product-requirements.md` for app requirements.

### Adding New API Endpoints:
- **Dev URLs must use the function export name**, not the rewrite path. In development, the Firebase emulator URL pattern is `http://127.0.0.1:5001/dynamic-re/us-central1/{functionExportName}`. For example, the portfolio function is exported as `portfolioRouter`, so the dev URL is `.../portfolioRouter/{path}`, NOT `.../portfolio/{path}`. The `/api/portfolio` path only works in production via Firebase Hosting rewrites.
- **CORS must be handled explicitly** in the request handler — do NOT rely solely on `cors: true` in `onRequest()`. Add manual CORS headers and an OPTIONS handler before the auth check, matching the pattern in `autocomplete/index.ts`:
  ```typescript
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  ```
- **Frontend API calls must use authenticated requests** (`useApiRequest` hook or `authenticatedPost`/`authenticatedGet` from `app/lib/api-client.ts`). Never use raw `fetch()` for endpoints that require auth.
- Follow the dev/prod URL pattern used in `app/context/PortfolioContext.tsx` when adding new frontend calls to existing routers.

### RentCast API:
- Reference `/docs/architecture/api-integration.md` for patterns
- ALWAYS use RentCastAPIManager wrapper (never direct axios calls)
- Include CallContext with every API call