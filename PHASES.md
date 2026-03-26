# Search UX Implementation Phases

Phased plan based on [search UX research](./docs/search-ux-research.md), tailored to this Next.js/Firebase/AWS OpenSearch stack. Quran text and translations sourced from [tanzil.net](https://tanzil.net).

---

## Phase 1: Tanzil.net Data Pipeline — Arabic Text & Metadata

**Goal:** Download and index Quran Arabic text and surah metadata from tanzil.net into OpenSearch so all downstream features have Arabic content to work with.

**Changes:**
- `quran_loader/` — take Uthmani text + Simple Clean for search, parse `quran-data.xml` metadata (114 surahs with names, verse counts, revelation type, juz/hizb markers)
- `functions/index.js` — update OpenSearch index mapping to add `text.arabic_uthmani` field (display) alongside existing `text.arabic` (search), and `surah_name`, `surah_name_arabic`, `revelation_type`, `juz`, `hizb` metadata fields
- `quran_loader/` — migration script to backfill existing `kitaab` index documents with Arabic text and metadata from Tanzil XML files

**Dependencies:** None (foundation phase)

**Test plan:**
- Run loader script locally against dev OpenSearch, verify Arabic text appears on documents
- Spot-check 5-10 verses (e.g., 2:255, 1:1, 112:1) to confirm Arabic text matches tanzil.net
- Verify existing search queries still return correct results (no regression)
- Confirm metadata fields (surah name, juz, hizb) are populated correctly

**Deploy notes:**
- Download Tanzil data files locally first, commit to `quran_loader/data/`
- Run migration script against production OpenSearch after index mapping update
- Backwards compatible — existing fields untouched, new fields are additive
- Credit Tanzil per their license: add attribution to footer/about

**Rollback:** New fields are additive; removing them from the mapping or ignoring them in queries restores previous behavior.

---

## Phase 2: Arabic Display Infrastructure

**Goal:** Add RTL rendering, Arabic web fonts, and bidirectional text utilities so the app can properly display Arabic script.

**Changes:**
- `package.json` — add `@fontsource/amiri` or configure Google Fonts for Amiri/KFGQPC Uthmani (Quranic font)
- `tailwind.config.js` — add `fontFamily.arabic` and RTL utility classes
- `app/globals.css` — Arabic font-face declarations, RTL layout utilities (`.rtl`, `dir="rtl"` scoped styles), CSS logical properties migration for key layout components (`margin-inline-start` instead of `margin-left`)
- `app/components/` — new `ArabicText.tsx` component wrapping text in proper `dir="rtl"` container with Arabic font stack, configurable size (2-4pt larger than Latin text per research)
- `app/layout.tsx` — add `dir="auto"` support on `<html>` or scoped containers

**Dependencies:** None (can run parallel to Phase 1)

**Test plan:**
- Render sample Quranic verses (Surah Al-Fatiha, Ayat al-Kursi) in a test page
- Verify Arabic text renders right-to-left with correct ligatures
- Verify mixed Arabic/English content doesn't break layout (bidirectional isolation with `<bdi>`)
- Test on Chrome, Safari, Firefox; iOS Safari, Android Chrome
- Verify existing English-only pages are unaffected

**Deploy notes:** CSS and font changes only — no data dependency. Feature-flag the `ArabicText` component usage behind a simple conditional until Phase 4 integrates it into result cards.

**Rollback:** Revert font imports and CSS additions; `ArabicText` component is unused until Phase 4.

---

## Phase 3: URL-Based Search State

**Goal:** Encode all search parameters in the URL so searches are shareable, bookmarkable, and browser-navigable (back/forward).

**Changes:**
- `app/search/page.tsx` — replace React state with `useSearchParams()` as source of truth for query, page, filters, mode; use `router.push()` for new searches, `router.replace()` for refinements (avoids flooding browser history)
- `app/components/SearchForm.tsx` — initialize from URL params, persist query in URL on submit
- `app/components/BookFilter.tsx` — read/write `title[]` from URL params
- `types/index.ts` — add `SearchParams` type for URL state shape

**Dependencies:** None

**Test plan:**
- Search for "mercy", verify URL updates to `/search?q=mercy&title[]=quran&title[]=bukhari`
- Copy URL, open in new tab — same results appear
- Toggle a book filter — URL updates, back button restores previous filter state
- Page through results — URL reflects page number
- Refresh page mid-search — state preserved

**Deploy notes:** This is a refactor of existing state management. The search API contract is unchanged. Query string format: `/search?q=mercy&scope=quran&page=2&sort=relevance`.

**Rollback:** Revert to React state-driven search (the current implementation).

---

## Phase 4: Result Card Redesign with Arabic Text

**Goal:** Implement structured visual hierarchy on result cards: source badge, reference number, breadcrumb, English text, Arabic text, narrator line, grade badge, action links.

**Changes:**
- `app/components/SearchResults.tsx` — redesign card layout:
  - Colored source badge ("Quran" / "Sahih al-Bukhari") replacing current border-color system
  - Prominent reference number (e.g., "2:255") as linkable element
  - Surah/chapter breadcrumb using metadata from Phase 1
  - Bold-highlighted English search terms
  - Arabic text (from Phase 1 data) using `ArabicText` component (Phase 2), stacked below English, with background-color highlights for Arabic term matches
  - Narrator line (italic) for hadith
  - Action links row: share, bookmark, copy reference
- `app/components/ExpandedSearchResult.tsx` — update expanded view for new card structure
- `app/globals.css` — result card styles, source badge colors, highlight styles
- `functions/index.js` — return `highlight` field from OpenSearch for term highlighting (use OpenSearch `highlight` API on `text` and `text.arabic` fields)

**Dependencies:** Phase 1 (Arabic text in index), Phase 2 (Arabic display components)

**Test plan:**
- Search for "mercy" — verify cards show source badge, reference, English with bold highlights, Arabic text below
- Search for an Arabic term — verify Arabic text has background-color highlights
- Verify hadith results show narrator line and volume badge
- Test card layout on mobile (stacked) and desktop
- Verify expand/collapse still works
- Verify bookmark button still works on new card layout

**Deploy notes:** This is a frontend-only change after the API `highlight` field is added. Can deploy API highlight support first (additive field), then frontend card redesign.

**Rollback:** Revert to current card layout. Highlight API field is ignored if frontend doesn't use it.

---

## Phase 5: Phased Loading Strategy

**Goal:** Replace current loading state with a three-phase approach: immediate acknowledgment (0-100ms), shimmer skeletons (300ms+), fade-in results (1-3s).

**Changes:**
- `app/components/SearchResults.tsx` — implement phased loading:
  - Phase 1 (0-100ms): thin progress bar at top, dim old results to 70% opacity, show contextual message ("Searching across Quran and Hadith collections...")
  - Phase 2 (300ms): transition to shimmer-animated skeleton cards matching result card layout
  - Phase 3: fade-in real results with 200ms staggered animation
- New component `SkeletonResultCard.tsx` — shimmer-animated placeholder matching Phase 4 card layout
- `app/globals.css` — shimmer animation keyframes, `prefers-reduced-motion` fallback to static skeletons
- `app/search/page.tsx` — cancel in-flight requests when user submits new query (AbortController), keep query in input field across searches

**Dependencies:** Phase 4 (skeleton must match new card layout)

**Test plan:**
- Submit search, verify progress bar appears immediately
- On slow connection (throttle in DevTools), verify skeleton cards appear after ~300ms
- Submit new search while results are loading — verify old request is cancelled, new loading sequence starts
- Verify `prefers-reduced-motion` disables shimmer animation
- Verify contextual messages rotate during wait

**Deploy notes:** Frontend-only. No API changes.

**Rollback:** Revert to current simple loading spinner.

---

## Phase 6: Homepage Hero Search (Centerstage)

**Goal:** Transform the logged in landing page (/search) into a search-forward experience with a large centered search bar, browsable entry points.

**Changes:**
- redesign search page to center a large search bar prominently; below it show:
- `app/components/SearchForm.tsx` — accept `size="large"` prop for hero variant

**Dependencies:** Phase 3 (URL-based search state for query handoff)

**Test plan:**
- Load search page — verify large search bar is prominent and centered
- Type a query and submit — redirects to `/search?q=...` with results
- Click a surah entry point — navigates to search or detail view
- Verify responsive layout on mobile (stacked, full-width)

**Deploy notes:** Frontend-only. Consider A/B testing hero layout vs current landing page via feature flag or Mixpanel experiment.

**Rollback:** Revert search to current design.

---

## Phase 7: Persistent Nav Bar Search

**Goal:** Add a compact search field to the global navigation bar so users can search from any page without returning to the homepage.

**Changes:**
- `app/components/Navbar.tsx` — add compact search input (hidden on homepage where hero search exists), with scope dropdown ("All" / "Quran" / "Hadith")
- `app/components/SideMenu.tsx` — remove Search nav item (now in navbar); keep deep link to advanced search
- `app/globals.css` — navbar search styles, responsive behavior (icon-only on narrow screens, expanding on tap)
- Mobile: tap search icon → full-screen search takeover (overlay with large input, recent searches, category quick-filters)

**Dependencies:** Phase 3 (URL-based search), Phase 6 (homepage hero exists)

**Test plan:**
- Navigate to `/bookmarks` — verify search bar visible in nav
- Type query in nav search — redirects to `/search?q=...`
- On homepage — verify nav search is hidden (hero search is primary)
- Mobile: tap search icon — full-screen search overlay appears
- Verify scope dropdown filters work ("Quran" → adds `title[]=quran` to URL)

**Deploy notes:** Frontend-only. Navbar search on mobile needs careful testing for virtual keyboard interactions.

**Rollback:** Revert Navbar.tsx changes; restore Search link in SideMenu.

---

## Phase 8: Progressive Disclosure Filtering

**Goal:** Implement two-tier filtering: always-visible source toggle + horizontal chips (Tier 1), and full filter sidebar/overlay on demand (Tier 2).

**Changes:**
- `app/components/BookFilter.tsx` — refactor into `SourceToggle.tsx` (Quran/Hadith/All scope selector near search bar) and `FilterChips.tsx` (horizontal scrollable chips for top collections, authentication grades, sort)
- New component `FilterSidebar.tsx` — desktop accordion sidebar with sections: Collection, Surah (searchable — solves the 114-surah problem), Topic, Narrator, Translation, Grading; each section shows result counts
- New component `FilterSheet.tsx` — mobile bottom sheet (60-80% screen height) with batch-apply ("Show 47 results" button)
- `app/search/page.tsx` — integrate filter components, wire to URL params (Phase 3)
- `functions/index.js` — add aggregation queries to return facet counts (e.g., results per collection, per surah) alongside search results
- `app/components/SearchResults.tsx` — show active filters as dismissible chips above results, "Clear All" button

**Dependencies:** Phase 1 (metadata for surah names), Phase 3 (URL state), Phase 4 (result cards)

**Test plan:**
- Search "mercy" — verify source toggle, filter chips, and facet counts appear
- Click "Quran" toggle — results filter, URL updates, counts refresh
- Open filter sidebar (desktop) — verify searchable surah list, collection checkboxes with counts
- Mobile: tap "Filters" — bottom sheet opens, select multiple filters, tap "Show N results" — applies batch
- Verify zero-result filters are grayed out
- Clear all filters — restores full result set

**Deploy notes:** Backend facet aggregation query ships first (additive response field), then frontend filter UI. Feature flag the sidebar if needed for gradual rollout.

**Rollback:** Revert to current `BookFilter.tsx`. Aggregation response field is ignored if unused.

---

## Phase 9: Mobile Search Optimizations

**Goal:** Implement mobile-specific UX: full-screen search takeover, card-based results with progressive disclosure, adjustable font sizes.

**Changes:**
- `app/components/SearchForm.tsx` — full-screen search overlay on mobile tap (if not already done in Phase 7)
- `app/globals.css` — mobile-specific result card styles (2-3 line snippets, stacked Arabic/English), user-adjustable font size control (stored in localStorage)
- `app/search/page.tsx` — font size toggle component (A-/A+) affecting result text and Arabic text
- Result cards: sticky search bar at top of results page on mobile

**Dependencies:** Phase 4 (card layout), Phase 5 (loading), Phase 7 (mobile search overlay)

**Test plan:**
- Test on iOS Safari and Android Chrome (or emulator)
- Verify full-screen search overlay works with virtual keyboard
- Adjust font size — Arabic text scales proportionally (2-4pt larger than English)
- Verify sticky search bar stays visible on scroll

**Deploy notes:** Frontend-only. Use responsive Tailwind breakpoints (`md:`, `lg:`) to differentiate mobile/desktop behavior.

**Rollback:** Revert to current infinite scroll and inline search.

---

## Phase 10: Autocomplete & Transliteration Expansion

**Goal:** Add typeahead suggestions with transliteration variant support so users find content despite Arabic spelling variations.

**Changes:**
- `functions/index.js` — new `/api/suggest` endpoint:
  - Returns autocomplete completions from OpenSearch `suggest` or prefix queries
  - Includes transliteration variant expansion (rule-based: Q↔K, ss↔s, dh↔th↔z, ee↔i, plus synonym table: Salah↔Prayer, Wudu↔Ablution)
  - Recognizes verse reference patterns ("2:255", "al-baqarah:255") and returns direct verse links
  - Surah name autocomplete ("al-b" → "Al-Baqarah (2), Al-Balad (90)")
- New `lib/transliteration.ts` — variant expansion rules and synonym maps (shared between frontend display and backend query expansion)
- New component `AutocompleteDropdown.tsx` — unified dropdown showing:
  - Zero-state (on focus): recent searches (localStorage), popular searches
  - 1-2 chars: autocomplete completions
  - 3+ chars: refined suggestions with scope indicators
  - 6-10 suggestions desktop, 5-8 mobile; 150ms debounce
- `app/components/SearchForm.tsx` — integrate `AutocompleteDropdown`, wire keyboard navigation (arrow keys, Enter, Escape)
- `functions/index.js` — update `/api/search` to silently include transliteration variants in queries; show "Showing results for 'Muhammad' (also including: Mohammed, Mohammad)" message

**Dependencies:** Phase 1 (surah metadata for name autocomplete), Phase 3 (URL state)

**Test plan:**
- Type "muh" — see "Muhammad, Muhammed, Mohammed" suggestions
- Type "2:25" — see "Surah Al-Baqarah 2:255, 2:254, 2:253..." suggestions
- Type "al-b" — see surah name completions
- Search "Mohommad" — results show "Showing results for 'Muhammad'" with variant expansion
- Verify keyboard navigation through suggestions (arrows, Enter, Escape)
- Verify 150ms debounce — no excessive API calls during fast typing
- Verify recent searches appear on focus with empty input

**Deploy notes:** Backend `/api/suggest` endpoint ships first. Frontend autocomplete ships separately. Transliteration rules can be expanded iteratively.

**Rollback:** Remove autocomplete dropdown; search works as before without suggestions. Transliteration expansion in `/api/search` is transparent and can be toggled off.

---

## Phase 11: Zero-Result & Error States

**Goal:** Replace empty result states with helpful, actionable pages that guide users toward content.

**Changes:**
- New component `ZeroResults.tsx` — displays in order:
  1. Clear message: "No results found for '[query]'"
  2. Spelling suggestions from transliteration variants ("Did you mean: Muhammad, Mohammed?")
  3. Related/popular searches as clickable links
  4. Search tips specific to Islamic text ("Try a surah name or verse number like 2:255")
  5. Browse links: "Browse Surahs", "Browse Hadith Collections"
  6. Scope expansion: "Your search was limited to Quran. Try searching all collections?"
- New component `SearchError.tsx` — error state with retry button + option to restore previous results
- `app/components/SearchResults.tsx` — integrate zero-result and error components
- `functions/index.js` — for multi-term queries with few results, try partial matching (drop least important term) and return relaxed results with strikethrough indication

**Dependencies:** Phase 10 (transliteration for spelling suggestions)

**Test plan:**
- Search for a gibberish query — verify zero-result page with all 6 sections
- Search for "Mohommad" (misspelling) — verify "Did you mean" suggestions
- Search "mercy" in Quran-only scope with no results — verify scope expansion suggestion
- Disconnect network, search — verify error state with retry button
- Multi-term search with partial results — verify relaxed matching display

**Deploy notes:** Frontend components + minor backend partial-matching logic. Ship together.

**Rollback:** Revert to current "no results" text display.

---

## Phase 12: Advanced Search Page

**Goal:** Build a dedicated advanced search page with multiple fields, scope selectors, and Boolean support for scholarly research.

**Changes:**
- New page `app/advanced-search/page.tsx` — full form with:
  - Keyword field (English)
  - Arabic text field (with `dir="rtl"` input)
  - Narrator chain field (hadith)
  - Scope selectors (Quran only / Hadith only / All)
  - Collection checkboxes
  - Authentication grade filter (Sahih / Hasan / Da'if)
  - Surah/chapter range selector
  - Boolean operator support (AND/OR/NOT)
  - Sort options (relevance, canonical order)
- `functions/index.js` — extend `/api/search` to accept structured advanced query params (narrator, grade, chapter range, Boolean operators)
- `app/components/SideMenu.tsx` — add "Advanced Search" link
- Autocomplete dropdown (Phase 10) — add "Advanced Search" link at bottom

**Dependencies:** Phase 1 (metadata), Phase 2 (Arabic input), Phase 3 (URL state), Phase 8 (filtering groundwork)

**Test plan:**
- Navigate to advanced search — verify all form fields render
- Fill multiple fields, submit — verify correct combined query in URL and results
- Test Boolean operators: "mercy AND forgiveness", "mercy NOT punishment"
- Test Arabic text input field with RTL keyboard
- Test chapter range filter: Surah 2, verses 255-260

**Deploy notes:** New page + backend query extension. The advanced query params are additive to the existing API.

**Rollback:** Remove the page route. API extensions are backwards-compatible (params are optional).

---

## Phase 13: Accessibility & Shareability

**Goal:** Add ARIA roles, keyboard navigation, semantic search labeling, and canonical URLs for every verse/hadith.

**Changes:**
- `app/components/SearchForm.tsx` — add `role="search"`, `aria-autocomplete="list"`, `aria-controls` linking to suggestion listbox
- `app/components/SearchResults.tsx` — add `aria-live="polite"` region announcing result count, `j`/`k` keyboard navigation between results
- `app/layout.tsx` — `/` keyboard shortcut to focus search bar (when not in text input)
- New page `app/quran/[chapter]/[verse]/page.tsx` — canonical Quran verse URLs (e.g., `/quran/2/255`) with full verse display, Arabic text, multiple translations, and metadata
- New page `app/hadith/[collection]/[number]/page.tsx` — canonical hadith URLs
- `app/components/SearchResults.tsx` — "Share" action generates canonical URL; "Copy Reference" copies formatted citation
- Search results: label semantic matches differently ("Exact match" vs "Related meaning") with info tooltip explaining semantic search
- CSS: use logical properties throughout (`margin-inline-start`, `padding-inline-end`), mirror directional icons in RTL

**Dependencies:** Phase 1 (metadata for verse pages), Phase 2 (Arabic display), Phase 4 (card redesign)

**Test plan:**
- Screen reader testing (VoiceOver on macOS/iOS): verify search form, results, and navigation are announced correctly
- Keyboard-only navigation: Tab through search, arrow through autocomplete, `j`/`k` through results, `/` to focus search
- Open `/quran/2/255` — verify full verse display with Arabic, translations, metadata
- Share button — verify canonical URL is copied
- Verify semantic match labels appear on KNN-only results
- RTL: verify logical properties don't break English layout

**Deploy notes:** Canonical verse pages are new routes — no conflict with existing pages. ARIA attributes and keyboard shortcuts are additive. Ship incrementally: ARIA first, then canonical URLs, then keyboard shortcuts.

**Rollback:** ARIA attributes are invisible to sighted users. Canonical URL pages can be removed as standalone routes. Keyboard shortcuts can be disabled.

---

## Conflicts & Decision Points

### 1. Tanzil.net Data: Static Download vs. On-Demand Fetch

**Conflict:** Tanzil offers downloadable files but no API. The Quran text and translations need to be sourced.

**Options:**
- **Option A:** Download all Tanzil XML files at build time, store in `quran_loader/data/`, index into OpenSearch during data pipeline. *Tradeoff: one-time effort, data could become stale if Tanzil updates.*
- **Option B:** Fetch from Tanzil URLs at indexing time in the loader scripts. *Tradeoff: simpler pipeline, but depends on Tanzil's availability.*

**Recommendation:** Option A — download once, version in the `quran_loader/data/` directory, re-run loader when Tanzil publishes updates (they version as v1.1, infrequent updates).

### 2. Infinite Scroll vs. Pagination

**Conflict:** Current implementation uses infinite scroll. Research doc recommends pagination for research platforms (URL-addressable pages, backtracking, citation). But mobile research recommends "Load More" buttons.

**Options:**
- **Option A:** Pagination on both desktop and mobile. *Tradeoff: consistent, URL-friendly, but more taps on mobile.*
- **Option B:** Pagination on desktop, "Load More" on mobile. *Tradeoff: best UX per device, but two code paths.*
- **Option C:** "Load More" everywhere with URL state tracking current depth. *Tradeoff: simpler, but less scholarly on desktop.*

**Choose:** Option A - This allows us to use the url to share and page to the exact spot that's necessary.

### 3. Phase 4 + Phase 5 Coupling

**Conflict:** The skeleton cards (Phase 5) must match the result card layout (Phase 4). If the card layout changes after skeletons are built, skeletons need updating.

**Options:**
- **Option A:** Ship Phase 4 and 5 together as one phase. *Tradeoff: larger PR, but guaranteed consistency.*
- **Option B:** Ship Phase 4 first, then Phase 5 immediately after with skeleton cards matching the finalized layout. *Tradeoff: two PRs, but Phase 4 can be reviewed independently.*

**Recommendation:** Option B — the skeleton is a straightforward mirror of the card layout and can ship as a fast follow.

---

## Phase Dependency Graph

```
Phase 1 (Tanzil Data) ──┬──→ Phase 4 (Card Redesign) ──→ Phase 5 (Loading) ──→ Phase 9 (Mobile)
                         │         ↑
Phase 2 (Arabic Display) ┘         │
                                   │
Phase 3 (URL State) ──┬──→ Phase 6 (Hero Search) ──→ Phase 7 (Nav Search) ──→ Phase 9 (Mobile)
                       │
                       ├──→ Phase 8 (Filtering)
                       │
                       └──→ Phase 10 (Autocomplete) ──→ Phase 11 (Zero Results)
                                                              │
Phase 12 (Advanced Search) ← Phases 1, 2, 3, 8 ──────────────┘

Phase 13 (Accessibility) ← Phases 1, 2, 4
```

Phases 1, 2, and 3 have no dependencies and can be built in parallel.
