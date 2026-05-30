# Story Pages SEO Redesign — Paginated, Server-Rendered Stories

**Date:** 2026-05-28
**Status:** Design — awaiting review
**Author:** brainstormed with Claude

## Problem

Story pages (`/story/[name]`) are statically generated at build, but their **content is not in the HTML**. The server component ([app/story/[name]/page.tsx](../../../app/story/[name]/page.tsx)) parses each story's XML and hands the verses to a client component ([app/story/[name]/page.client.tsx](../../../app/story/[name]/page.client.tsx)) that:

- renders **zero translations initially** — translations are filtered by `selectedTranslators`, which starts as `[]` ([page.client.tsx:49,217](../../../app/story/[name]/page.client.tsx#L49)),
- renders **no Arabic** — `InteractiveArabicText` is called without `uthmaniText`, so during SSR it returns `null` ([InteractiveArabicText.tsx:142](../../../app/components/InteractiveArabicText.tsx#L142)) and only fetches the Arabic from Storage after hydration, and
- renders **only the first 20 verses** due to virtual scrolling ([page.client.tsx:38,52,171](../../../app/story/[name]/page.client.tsx#L38)).

Net result: a crawler sees the `<h1>`, a "A collection of N verses about X" blurb, a sign-in banner, and an empty verse list. The actual story — its verses and translations — is invisible to crawlers. This mirrors the Quran reader's "Loading Quran reader…" SEO problem.

Story data also still lives in `public/stories/*.xml` (~5 MB across 13 files), read via `fs` at build. Unlike the Quran reader it does not fetch `public/` at runtime, so it is not *broken* — but it is the same `public/`-coupled anti-pattern the Quran migration retired (see the Quran spec's "Out of scope" note: [2026-05-28-quran-reader-seo-redesign-design.md](2026-05-28-quran-reader-seo-redesign-design.md)).

## Goals

1. **SEO-first**: every story page server-renders real verse content (Arabic + a translation) into the HTML, crawlable and in the sitemap.
2. **Paginated, indexable URLs**: each page is independently crawlable with correct, self-referencing canonicals.
3. **Reuse** the Quran migration's building blocks: `lib/quran-data.ts`, the Storage word proxy, `buildContextUrl`, and native `app/sitemap.ts` / `app/robots.ts`.
4. Preserve word-level interactivity and translator switching as **client islands** layered over crawlable HTML.

## Non-Goals

- No visual redesign — reuse `InteractiveArabicText`, `TranslationCarousel`, `TranslatorSelector`, `WordDrawer`/`WordBottomSheet`.
- No change to the Quran reader, search, or MCP features.
- No change to the per-verse Quran pages that stories link into (`/quran/[surah]/[verse]`).

## Decisions (resolved during brainstorming)

| Topic | Decision |
|---|---|
| Page structure | **Paginate**, uniform **~25 verses/page**. Page 1 stays at `/story/[name]`; pages 2+ at `/story/[name]/[page]` |
| Canonicalization | **Self-canonical per page** + `rel="prev"`/`rel="next"`; unique `<title>`/description per page |
| SSR content | **Arabic (joined from `lib/quran-data`) + one default translation per verse**; other translations revealed client-side; Hadith verses render translation-only |
| Data | **Pre-convert XML → JSON** committed to `data/stories/`; loader reads JSON; remove `xml2js` from the app's runtime |
| Render strategy | **Fully static** — all pages prebuilt via `generateStaticParams`; no runtime data dependency |

## Architecture

### Routes & rendering

```
/stories                  static (prebuilt)   index of the 13 stories
/story/[name]             static (prebuilt)    page 1 of a story
/story/[name]/[page]      static (prebuilt)    pages 2..M (generateStaticParams enumerates per story)
```

- Both story routes set `export const dynamicParams = false;` → any param not enumerated by `generateStaticParams` returns 404. There is no on-demand rendering: every page is baked at build.
- `generateStaticParams`:
  - `/story/[name]` → all 13 `ALLOWED_STORIES`.
  - `/story/[name]/[page]` → for each story, `2..getStoryPageCount(name)` (omits page 1, which lives at `/story/[name]`).
- `/story/[name]/1` → **308 redirect** to `/story/[name]` (added to existing [middleware.ts](../../../middleware.ts)), so the duplicate of page 1 is never indexed.

### Data: build-time JSON, Arabic joined from `quran-data`

- **Conversion script** `scripts/convert-stories.js` (the only remaining `xml2js` consumer): reads `public/stories/*.xml` → writes `data/stories/{name}.json` with shape:

  ```jsonc
  {
    "name": "adam",
    "title": "Story of Adam",
    "versesCount": 165,
    "verses": [
      {
        "chapter": 51,
        "verse": 56,
        "chapterName": "",
        "bookId": "en.ahmedali",
        "translations": [ { "author": "Ahmed Ali", "text": "..." } ]
      }
    ]
  }
  ```

  **Arabic is intentionally not stored** in the story JSON — it is joined at build from `lib/quran-data` (single source of truth; keeps story JSON lean).

- **Loader** `lib/story-data.ts` (reads `data/stories/*.json`, cached; mirrors `lib/quran-data.ts`):
  - `listStories(): StorySummary[]` → `{ name, title, description, versesCount, pageCount }` (description from `story-config`).
  - `getStoryPage(name, page): StoryPageData | null` → the verse slice for that page, each verse enriched with `arabic` via `getVerse(chapter, verse)` (null for Hadith/non-Quran refs) and a resolved `defaultTranslation`, plus pagination meta `{ page, pageCount, totalVerses }`.
  - `getStoryPageCount(name): number`.
- **Default translator** is chosen **story-wide** for a consistent narrative voice: a small configured preferred-translator order, falling back to the most frequent translator across the story. Per verse, render that translator's text if present; otherwise fall back to the verse's first available translation (covers Hadith verses and verses missing the default translator).
- `lib/story-config.ts` (`ALLOWED_STORIES`, `STORY_METADATA`) is kept as the source of the SEO titles/descriptions.

Because all pages are fully static, the `data/stories/` JSON is a pure **build input**: never served, never shipped to the runtime bundle (no file-tracing needed, unlike the on-demand Quran verse pages).

### Page composition (story page)

All of the following ends up in the SSR HTML (crawlable). Some is emitted by the server component directly; the verse list is emitted by a client island whose **initial render** (the SSR pass, and the first client render it must match) already contains the content — that is the fix for today's empty-HTML bug.

Emitted by `StoryReader` (server component):
- Breadcrumb: Stories › {Story title} (› Page N), with internal links.
- Pagination nav: real `<a>` prev/next links + page numbers ("Page N of M").
- JSON-LD: `Article` (self URL, `mainEntityOfPage` = self) + `BreadcrumbList`.
- Per-page metadata via the Metadata API: self-referencing `canonical`; `<link rel="prev">`/`<link rel="next">` for adjacent pages (emission mechanism verified during implementation — see Verification).

Emitted by the `StoryReaderClient` island (initial render = SSR HTML; hydrates for interactivity, wrapped in `WordDictionaryProvider`):
- Each verse, in the initial render:
  - Arabic via `InteractiveArabicText` **with `uthmaniText` passed** (from the joined `quran-data` text) — the SSR pass renders the plain Arabic fallback; hydration upgrades to clickable words. Omitted for Hadith verses with no Quran Arabic.
  - The **default translation** text via `TranslationCarousel`, because `selectedTranslators` is initialized to `[defaultTranslator]` (not `[]`).
  - The existing "Read section" deep-link to `/quran/{chapter}/{verse}` via `buildContextUrl` (internal crawl link).
- After mount / on interaction:
  - `TranslatorSelector` reads the `localStorage` preference **after mount** to avoid a hydration mismatch; full per-page translations are passed as props so non-default translations can be revealed without a fetch.
  - `InteractiveArabicText` upgrade + `WordDrawer` (desktop) / `WordBottomSheet` (mobile).
  - Sign-in banner (auth-dependent) + Mixpanel tracking.
- **Virtual scrolling is removed** — pagination replaces it; all ~25 verses on a page render.

### Shared rendering

A server component `app/story/[name]/StoryReader.tsx` takes `{ name, page }` and produces one page's render (breadcrumb, verses, pagination, JSON-LD). Both route files (`page.tsx` for page 1, `[page]/page.tsx` for pages 2+) are thin wrappers that call it, so there is one rendering path.

### SEO plumbing

- **Metadata** (per page):
  - Page 1 (`/story/[name]`): `title` = story title; `description` = `STORY_METADATA` description; `canonical` = `/story/[name]`; `rel="next"` → page 2 (if `pageCount > 1`).
  - Page N (`/story/[name]/N`): `title` = `"{Story title} — Page N of M"`; `description` = `STORY_METADATA` description; `canonical` = `/story/[name]/N` (self); `rel="prev"` (→ `/story/[name]` when N = 2, else `/story/[name]/{N-1}`) and `rel="next"` (→ `/story/[name]/{N+1}` if it exists).
- **Sitemap** ([app/sitemap.ts](../../../app/sitemap.ts)): add `/stories` (currently missing) and enumerate `/story/[name]` plus `/story/[name]/2..pageCount` for every story, using `lib/story-data`. Quran and existing entries unchanged.
- **robots.ts** unchanged.

### Caching

Stories are **fully prebuilt static HTML**, so the Quran reader's on-demand-SSR + hand-crafted long `s-maxage` approach does **not** apply: there is no first-hit Cloud Run render and no cold-start latency to mitigate. The relevant considerations are:

1. **The SSR output must stay user-agnostic so one cached HTML serves everyone.** This is the load-bearing design constraint and the reason for several earlier decisions:
   - The default translator is **deterministic** (not `localStorage`/cookie-driven). User translator preference is applied client-side after hydration.
   - The sign-in banner (auth state) and translator switching are **client-only**.
   - The story page **must not** read `searchParams`, `cookies()`, or `headers()` server-side. Any per-user variance (translator preference, auth UI, any future `?highlight`) stays client-side — mirroring the Quran spec's "client-only highlight" rule. Violating this turns the page dynamic/`private` and loses edge cacheability.
2. **Confirm the `Cache-Control` Next 14 emits for prebuilt static app-router pages on App Hosting.** This is the one empirical unknown (same verification item the Quran spec flagged). If Next serves these with a conservative header (e.g. `max-age=0, must-revalidate`), add a `headers()` rule in `next.config.js` for `/story/...` so Cloud CDN caches at the edge. Correctness does not depend on the mechanism, only that the deployed header is cacheable (not `private`/`no-store`).
3. **Word data is already well-cached** — the Storage proxy sets `public, max-age=86400, s-maxage=31536000, immutable` ([app/api/storage/[...path]/route.ts:34](../../../app/api/storage/[...path]/route.ts#L34)). No change.
4. **Invalidation on deploy is simpler than the Quran case.** Story content changes only on deploy (data is a build input) and pages are rebuilt static assets tied to the build, so a rollout serves fresh HTML; the long-lived on-demand-cache staleness risk that concerned the Quran spec is largely absent. A one-line post-deploy check that the CDN serves the new HTML is still worthwhile.

## Units / boundaries

| Unit | Purpose | Interface | Depends on |
|---|---|---|---|
| `scripts/convert-stories.js` | One-time/repeatable XML→JSON conversion | CLI script | `xml2js`, `public/stories/*.xml` |
| `data/stories/*.json` | Build-only story data (translations, no Arabic) | JSON files | — |
| `lib/story-data.ts` | Typed loader + Arabic join + default-translator + pagination | `listStories`/`getStoryPage`/`getStoryPageCount` | `data/stories`, `lib/quran-data`, `lib/story-config` |
| `app/story/[name]/StoryReader.tsx` | Shared server render of one page | `{ name, page }` | `lib/story-data`, client island |
| `app/story/[name]/page.tsx` | Page 1 route | route, `generateMetadata`, `generateStaticParams` | `StoryReader` |
| `app/story/[name]/[page]/page.tsx` | Pages 2+ route | route, `generateMetadata`, `generateStaticParams` | `StoryReader` |
| `app/story/[name]/StoryReaderClient.tsx` | Interactivity island (selector/carousel/drawer/banner) | props: verses, defaultTranslator | existing components, `WordDictionaryProvider` |
| `app/sitemap.ts` | Add `/stories` + all story pages | Next metadata route | `lib/story-data` |
| `middleware.ts` | `/story/:name/1` → 308 → `/story/:name` | `NextResponse.redirect` | — |
| `lib/story-config.ts` | SEO titles/descriptions + allowlist (kept) | `ALLOWED_STORIES`, `getStoryMetadata` | — |

## Error handling

- Unknown story (`name` not in `ALLOWED_STORIES`) → `notFound()` (404).
- Out-of-range / non-numeric `page` → `notFound()` (enforced by `dynamicParams = false`).
- `/story/[name]/1` → 308 redirect to `/story/[name]`.
- Verse with no Quran Arabic (Hadith / non-Quran ref) → translation-only (no Arabic block).
- Verse missing the default translator → fall back to the verse's first available translation.
- Word-data fetch failure → existing graceful fallback: `InteractiveArabicText` shows plain Arabic (no interactivity).

## Verification approach

(No test framework added — verification-driven, matching the migration convention.)

- `npx tsc --noEmit` and `npm run build` succeed; all story pages are prebuilt (13 stories → ~N total pages — confirm count); the app bundle no longer imports `xml2js` at runtime.
- Local `next build && next start`, then `curl`:
  - `/story/adam` → 200; HTML contains Arabic **and** a translation (view-source, not just hydration).
  - `/story/adam/2` → 200 with the next batch of verses; self-canonical; `rel="prev"`/`rel="next"` present in `<head>`.
  - `/story/adam/999` → 404; `/story/adam/1` → 308 → `/story/adam`.
  - Response `Cache-Control` is cacheable (not `private`/`no-store`); add `next.config.js` `headers()` if it is not.
  - `/sitemap.xml` → 200 and contains `/stories`, `/story/adam`, and `/story/adam/2…`.
- Word drawer: clicking an Arabic word fetches `/api/storage/quran/words/{n}.json` (200) and opens.
- **Deployed smoke test** (post-rollout): `/story/adam` returns content + cacheable header; verify the CDN serves the freshly built HTML after deploy.

## Migration / removal

- Run `scripts/convert-stories.js` to produce `data/stories/*.json`; commit the JSON.
- **Delete `public/stories/`** (data now in `data/stories/`).
- Remove `xml2js` from the app's runtime dependencies (used only by the conversion script).
- Replace the monolithic `app/story/[name]/page.client.tsx` with the trimmed `StoryReaderClient` (no virtual scrolling; correct initial state: default translator selected, `uthmaniText` passed).
- Add the `app/story/[name]/[page]/` route and the shared `StoryReader.tsx`.
- Add `/stories` to the sitemap.

## Risks / tradeoffs

- **Pipeline coupling**: regenerating a story now also requires re-running `convert-stories.js` (accepted decision; document the step alongside the script).
- **`rel=prev/next` on Next 14**: exact emission mechanism (hoisted `<link>` in the server component vs `next.config`/metadata `other`) confirmed during implementation; correctness does not depend on which.
- **Props payload weight**: passing full per-page translations to the client island for switching adds download weight (~25 verses' worth); acceptable, and it is not rendered into the visible DOM.
- **Arabic join coverage**: relies on `lib/quran-data` having each referenced Quran verse; Hadith refs intentionally fall back to translation-only.
- **`Cache-Control` mechanics on Next 14 + App Hosting**: confirmed on the deployed site (see Caching/Verification).
