# Quran Reader SEO Redesign — Per-Verse Pages on App Hosting

**Date:** 2026-05-28
**Status:** Design — awaiting review
**Author:** brainstormed with Claude

## Problem

The deployed `/quran` page errors. Root cause (confirmed empirically against the live App Hosting site):

- Every file under `public/` returns a 404 on the deployed backend — root files (`/robots.txt`, `/sitemap.xml`) and nested data (`/quran/metadata.json`, `/quran/1.json`, `/quran/words/{n}.json`) alike. `_next/static` assets and SSR HTML serve fine (200).
- The current `/quran` page ([app/quran/page.client.tsx](../../../app/quran/page.client.tsx)) is a pure client component that fetches its data from `public/` at runtime ([lib/quran-utils.ts](../../../lib/quran-utils.ts) `fetchQuranMetadata`/`fetchSurahData`). When `/quran/metadata.json` 404s, it sets `error = 'Failed to load Quran metadata'`. Word interactivity is broken the same way ([InteractiveArabicText.tsx:15](../../../app/components/InteractiveArabicText.tsx#L15) fetches `/quran/words/{n}.json`).

This surfaced after the SSR migration (PR #61) removed `output: 'export'`. Under the old static export, `public/` was baked into the exported output and served by classic Hosting; under App Hosting the framework adapter no longer serves this project's `public/` directory, so all runtime `public/` fetches fail.

Beyond the bug, the page has **no SEO value**: it renders nothing meaningful server-side (crawlers see "Loading Quran reader…"), and uses non-indexable `?start=&end=` query-range URLs.

## Goals

1. **Fix the breakage** by removing all runtime dependence on `public/` being served.
2. **SEO-first**: every verse is a crawlable, server-rendered URL with real Arabic + translations in the HTML, indexed and in the sitemap.
3. **CDN-cached, fast deploys**: lean on App Hosting's Cloud CDN (which fronts every request and caches by `Cache-Control`) rather than build-time prerendering, so CI/CD stays fast regardless of page count.
4. Preserve the existing deep-link/"context viewer" behavior used by search results, stories, and word examples.

## Non-Goals

- Redesigning the visual styling of verses/translations (reuse existing `ArabicText`, `TranslationCarousel`, `WordDrawer`, `WordBottomSheet`, `TranslatorSelector`).
- Changing the MCP server, search, or API-key features.
- Fixing `public/stories/*.xml` serving (same underlying issue — see Out of Scope).

## Decisions (resolved during brainstorming)

| Topic | Decision |
|---|---|
| URL granularity | **Per-verse pages** `/quran/[surah]/[verse]` (6,236), plus surah index `/quran/[surah]` (114) and `/quran` landing |
| Reading continuity | **Focal verse + light context** (~2 dimmed neighbor verses each side); canonical points to the focal verse |
| Render strategy | **On-demand SSR + long CDN `Cache-Control`** (not full SSG); prebuild only the ~115 index pages |
| Word-morphology data | **Lazy-fetch from the Storage proxy** (`/api/storage/...`), uploaded to the bucket; not bundled |
| Verse/translation data | **Imported at build time** from a build-only `data/` dir; baked into HTML; never served at runtime |
| SEO files | Replace `public/robots.txt` + `public/sitemap.xml` with native **`app/robots.ts`** + **`app/sitemap.ts`** |

## Architecture

### Routes & rendering

```
/quran                    static (prebuilt)   surah index, 114 links
/quran/[surah]            static (prebuilt)    surah landing: heading, intro, JSON-LD, verse links
/quran/[surah]/[verse]    on-demand + cached   canonical content page (6,236)
```

- `/quran` and `/quran/[surah]`: `generateStaticParams` prebuilds all 114 surahs (cheap, instant, indexed at build).
- `/quran/[surah]/[verse]`:
  - `export const dynamicParams = true;`
  - `export const revalidate = false;` (immutable content — never revalidate)
  - `generateStaticParams` returns `[]` → verse pages are **generated on first request** and cached.
  - The page must stay statically renderable: **no server-side dynamic APIs** (no `cookies()`, `headers()`, and crucially do **not** read the `searchParams` prop). Because `dynamicParams = true` allows any param through, validity is enforced explicitly: out-of-range or non-numeric `surah`/`verse` calls `notFound()` (404).
  - **Caching:** emit a long-lived `Cache-Control` (target `public, s-maxage=31536000, stale-while-revalidate=86400`, immutable intent) so Cloud CDN serves subsequent requests from the edge without hitting Cloud Run. Exact header-setting mechanism (route `revalidate` vs explicit `next.config.js` `headers()` for `/quran/:surah/:verse`) to be verified against the deployed `Cache-Control` during implementation — see Verification.
  - **Cache invalidation:** content only changes on deploy (data is a build input). Confirm App Hosting purges the CDN cache on rollout; if it does not, fall back to a moderate `s-maxage` or a release-keyed approach. Tracked as a verification item.

### Data: build-time verse data, Storage-served word data

- **Relocate** `public/quran/{1..114}.json` and `public/quran/metadata.json` → **`data/quran/`** (a build-only directory, not under `public/`). Add a typed, cached loader `lib/quran-data.ts`:
  - `getMetadata(): QuranMetadata`
  - `getSurah(index): SurahData`
  - `getVerse(surah, verse): QuranVerse | null`
  - `getContext(surah, verse, radius): QuranVerse[]` (focal ± radius, clamped to surah bounds)
  - `getAdjacent(surah, verse): { prev, next }` (handles surah boundaries)
  - These read from `data/quran/` and are consumed by Server Components and `generateStaticParams`. Reuse the existing types in [lib/quran-utils.ts](../../../lib/quran-utils.ts) (`SurahData`, `QuranVerse`, `QuranMetadata`).
- **Word morphology** (`public/quran/words/{n}.json`, ~55 MB): **upload to the Storage bucket** at path `quran/words/{n}.json` via a new script in the `quran_loader` workspace. Repoint `loadSurahWords()` in [InteractiveArabicText.tsx](../../../app/components/InteractiveArabicText.tsx) from `/quran/words/${chapter}.json` → `/api/storage/quran/words/${chapter}.json` (existing proxy [app/api/storage/[...path]/route.ts](../../../app/api/storage/[...path]/route.ts), `Cache-Control: public`). Remove `public/quran/` entirely afterward.

### Page composition (verse page)

Server-rendered (in HTML, for SEO):
- Breadcrumb: Quran › {Surah name} › Verse {n}.
- Context verses (focal ± ~2): plain Arabic (`ArabicText`) + translations, dimmed, **non-interactive**, each linking to its own `/quran/{s}/{v}` page (internal crawl links).
- Focal verse: `InteractiveArabicText` (renders plain Arabic in SSR as the fallback, upgrades to clickable words after lazy word-data fetch) + **all 17 translations** rendered into the DOM (carousel/selector toggle visibility via CSS so all remain crawlable).
- Prev/next verse links with `rel="prev"`/`rel="next"`.
- JSON-LD (verse as `CreativeWork`/quotation, `isPartOf` the surah) + per-page `<title>`/description/canonical (self-referencing).

Client islands (hydrate over the SSR content, wrapped in `WordDictionaryProvider`):
- `TranslatorSelector` (selection persisted in `localStorage`).
- `TranslationCarousel`.
- `WordDrawer` (desktop) / `WordBottomSheet` (mobile).
- `?highlight=term` handling read via `useSearchParams()` **client-side only**, so the server render stays static/cacheable.

### SEO plumbing

- **`app/robots.ts`** — replaces `public/robots.txt`: `User-agent: *`, `Disallow: /api/`, `Allow: /`, `Sitemap: {SITE_URL}/sitemap.xml`.
- **`app/sitemap.ts`** — replaces `public/sitemap.xml` and retires `scripts/generate-sitemap.js` (remove the `prebuild` hook). Emits: existing static pages + the 13 stories (preserve current entries) + `/quran`, all 114 `/quran/[surah]`, and all 6,236 `/quran/[surah]/[verse]` URLs (~6,364 total; one sitemap, under the 50k limit). Surah/verse counts come from `lib/quran-data.ts`.

### Deep-links & legacy redirects

- Update `buildContextUrl(chapter, verse, query?)` in [lib/quran-utils.ts](../../../lib/quran-utils.ts) to return `/quran/{chapter}/{verse}` plus `?highlight={query}` when a query is present. Call sites already pass chapter/verse: [SearchResults.tsx:419](../../../app/components/SearchResults.tsx#L419), [story page](../../../app/story/[name]/page.client.tsx#L251), [WordMorphologyContent.tsx:291](../../../app/components/WordMorphologyContent.tsx#L291) (convert its inline range URL to `buildContextUrl`).
- **`middleware.ts`**: match `/quran` with a `start` query param → 308 redirect to `/quran/{startSurah}/{startVerse}` (carry `highlight` if present). Keeps already-indexed legacy URLs alive and keeps verse pages free of server-side query reads.

## Units / boundaries

| Unit | Purpose | Interface | Depends on |
|---|---|---|---|
| `lib/quran-data.ts` | Build-time Quran data access | `getMetadata/getSurah/getVerse/getContext/getAdjacent` | `data/quran/*.json`, types from `quran-utils` |
| `app/quran/page.tsx` | Surah index (static) | route | `lib/quran-data` |
| `app/quran/[surah]/page.tsx` | Surah landing (static) | route, `generateStaticParams` | `lib/quran-data` |
| `app/quran/[surah]/[verse]/page.tsx` | Verse content (on-demand, cached) | route, `generateStaticParams`, metadata | `lib/quran-data`, client islands |
| `app/quran/[surah]/[verse]/VerseClient.tsx` | Client islands wrapper (selector/carousel/drawer/highlight) | props: verses, translators | existing components, `WordDictionaryProvider` |
| `app/robots.ts` / `app/sitemap.ts` | SEO routes | Next metadata routes | `lib/quran-data` |
| `middleware.ts` | Legacy `?start=` redirect | `NextResponse.redirect` | — |
| `quran_loader/upload-words-to-storage.js` | One-time: upload word JSON to bucket | CLI script | firebase-admin/Storage |

## Error handling

- Invalid `surah`/`verse` (out of range, non-numeric) → `notFound()` (404).
- Word-data fetch failure → existing graceful fallback: `InteractiveArabicText` renders plain `ArabicText` (no interactivity), so the verse still reads. Word data is non-critical/lazy.
- Storage proxy already returns 404/500 appropriately; no change.

## Verification approach

(No test framework added — verification-driven, matching the migration plan's convention.)

- `npx tsc --noEmit` and `npm run build` succeed; build does **not** prerender 6k pages (confirm only ~115 prebuilt).
- Local `next build && next start`, then `curl -I`:
  - `/quran/2/255` → 200, HTML contains Arabic + a translation (view-source, not just hydration).
  - Response `Cache-Control` is long-lived/cacheable (not `private`/`no-store`).
  - `/quran/999/1` → 404; `/robots.txt` → 200 from `app/robots.ts`; `/sitemap.xml` → 200 and contains verse URLs.
  - `/quran?start=2:255&end=2:260` → 308 → `/quran/2/255`.
- Word drawer: clicking a word fetches `/api/storage/quran/words/2.json` (200 after upload) and opens.
- **Deployed smoke test** (post-rollout): `/quran/2/255` returns content + cacheable header; second request is a CDN hit; verify CDN cache is purged by the rollout.

## Migration / removal

- Delete `app/quran/page.client.tsx` (range/pagination client model) and the `fetchSurahData`/`fetchQuranMetadata`/range helpers in `quran-utils` that are no longer used (keep `parseVerseRef`, `getBookIdForAuthor`, `buildContextUrl`).
- Remove `public/quran/` (verse data moved to `data/`, word data moved to Storage).
- Remove `public/robots.txt`, `public/sitemap.xml`, `scripts/generate-sitemap.js`, and the `prebuild` script entry.

## Risks / tradeoffs

- **First-hit latency**: the first request to each uncached verse pays a Cloud Run render (plus possible cold start at `minInstances: 0`). Cheap render; acceptable for crawlers/users; mitigated by CDN caching thereafter. Could raise `minInstances` if traffic warrants (cost tradeoff).
- **CDN cache invalidation on deploy**: must confirm App Hosting purges on rollout; otherwise a data correction could be stale. Verification item.
- **`Cache-Control` mechanics on Next 14 + App Hosting**: the exact way to emit the desired header for an on-demand page needs confirmation on the deployed site (ISR `revalidate` vs `next.config` `headers()`); the design's correctness does not depend on which, only that the emitted header is cacheable.
- **One-time data upload**: word JSON (~55 MB) must be uploaded to Storage before the word drawer works in production.

## Out of scope (flagged)

- `public/stories/*.xml` almost certainly has the same "App Hosting doesn't serve `public/`" problem. If story pages fetch those at runtime, they're broken too. Recommend a follow-up applying the same pattern (build-time import or Storage proxy).
