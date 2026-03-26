# Arabic Word Dictionary — Implementation Phases

Click an Arabic word in search results → see all English translations, root analysis, morphological breakdown, and cross-references. Phased plan building on the existing Next.js/Firebase/OpenSearch stack.

---

## Background & Key Design Decisions

### How do you distinguish a "word" in Arabic text?

Arabic text is whitespace-delimited, but a single token can contain **clitics** — attached prepositions (`bi-`, `li-`), conjunctions (`wa-`, `fa-`), the definite article (`al-`), and pronominal suffixes (`-hu`, `-hum`). For example, `وبكتابهم` is one visible token but contains 4 morphemes: *wa* (and) + *bi* (with) + *kitaab* (book) + *ihim* (their).

**For Quranic text, we don't need to solve this at runtime.** The [Quran.com API](https://api.quran.com/api/v4/) and [Quranic Arabic Corpus](https://corpus.quran.com) provide **pre-computed word-by-word data** with morphological analysis, transliteration, and per-word translations for every word in every verse. We ingest this data and use it to render each word as a clickable span.

For the **Uthmani text** currently displayed, word boundaries are already defined by these datasets — each word has a position index within its verse. Diacritics (tashkeel) must be **normalized** when matching user-facing Uthmani text to the word database (strip harakat, normalize alef variants, normalize taa marbuta).

### Where to ingest dictionary data from?

Three tiers, ingested in order of priority:

1. **Quran.com API / Quranic Arabic Corpus** — word-by-word translations, transliteration, morphology (root, lemma, POS, verb form) for every Quran word. This is the primary source and covers the Quran completely. Available via `https://api.quran.com/api/v4/verses/by_chapter/{ch}?words=true&word_fields=text_uthmani,text_indopak,translation,transliteration` or downloadable datasets.

2. **Lane's Lexicon (Quranic roots)** — [`aliozdenisik/quran-arabic-roots-lane-lexicon`](https://github.com/aliozdenisik/quran-arabic-roots-lane-lexicon) provides 1,651 Quranic Arabic roots with scholarly Lane's Lexicon definitions in JSON/XML. Gives deeper etymological meaning per root.

3. **Hans Wehr Dictionary** — [`GibreelAbdullah/HansWehrDictionary`](https://github.com/GibreelAbdullah/HansWehrDictionary) provides `hanswehr.sqlite` — a comprehensive modern Arabic-English dictionary. Useful for hadith text and general Arabic words not covered by Quran-specific sources.

### How does it handle grammar / tenses?

Arabic words derive from **triliteral roots** (3 consonants). The root `ك-ت-ب` (k-t-b) produces: *kitāb* (book), *kātib* (writer), *maktaba* (library), *maktūb* (written), *kutub* (books). There are ~10 verb forms (I–X) that follow predictable morphological patterns.

**Strategy:** Map every surface word to its root using pre-computed morphology data from the Quranic Arabic Corpus. When a user clicks a word, look up its root, then show:
- The word's specific meaning in this verse
- The root and its core semantic field
- Other words in the Quran sharing the same root (cross-references)

For hadith (Phase 6+), where pre-computed data doesn't exist, use **CAMeL Tools** (Python, NYU Abu Dhabi) as a microservice for morphological analysis and root extraction.

### Is OpenSearch semantic search useful here?

**Yes, for two specific purposes:**

1. **Disambiguation** — Arabic roots often have multiple meanings depending on context. The word `عين` (ʿayn) can mean "eye," "spring (of water)," or "essence." Semantic embeddings capture contextual meaning, so searching for verses with a specific sense of an ambiguous root can leverage the existing Cohere embeddings.

2. **"Find similar usage" feature** — After showing a word's meaning, offer "find other verses using this word with a similar meaning" via KNN search on the embedding space, filtered by root. This goes beyond keyword matching.

The existing hybrid search (BM25 + Cohere embeddings + RRF) is already well-suited. A new `root` field in the OpenSearch index enables root-based filtering that complements both keyword and semantic search.

---

## Phase 1: Quran Word-by-Word Data Ingestion

**Goal:** Download and store word-by-word data (Arabic word, translation, transliteration, morphology, root) for all 6,236 Quran verses, making it available as static JSON files for the frontend.

**Changes:**
- `quran_loader/fetch-word-by-word.js` — new script that fetches word-level data from the Quran.com API (`/v4/verses/by_chapter/{ch}?words=true&word_fields=text_uthmani,translation,transliteration`) for all 114 surahs, with rate limiting and retry logic
- `public/quran/words/{1-114}.json` — output files, one per surah, structured as:
  ```json
  {
    "surah": 1,
    "verses": {
      "1": {
        "words": [
          {
            "position": 1,
            "text_uthmani": "بِسْمِ",
            "text_simple": "بسم",
            "translation": "In (the) name",
            "transliteration": "bis'mi",
            "root": "س م و",
            "lemma": "ٱسْم",
            "pos": "N",
            "morphology": "STEM|POS:N|LEM:{som|ROOT:smw|M|GEN"
          }
        ]
      }
    }
  }
  ```
- `quran_loader/build-root-index.js` — new script that processes all word files to generate `public/quran/words/roots.json` — a reverse index mapping each root to all (surah, verse, position) occurrences:
  ```json
  {
    "س م و": {
      "occurrences": 19,
      "verses": [{"s": 1, "v": 1, "p": 1}, {"s": 2, "v": 31, "p": 3}, ...]
    }
  }
  ```

**Dependencies:** None (foundation phase)

**Test plan:**
- Run fetch script against Quran.com API, verify all 114 files are generated
- Spot-check words from well-known verses (1:1 بسم الله, 2:255 آية الكرسي) against quran.com website
- Verify root index contains expected roots (ر ح م for mercy, ك ت ب for writing)
- Verify word count per verse matches expected totals

**Deploy notes:**
- Static JSON files committed to `public/quran/words/` — no backend changes needed
- Quran.com API is free but rate-limited; fetch script should cache responses and be idempotent
- Add attribution for Quran.com data per their terms

**Rollback:** Delete the `public/quran/words/` directory. No other code depends on it yet.

---

## Phase 2 + 3: Clickable Arabic Words & Word Definition Popup ✅ DONE

**Goal:** Replace plain-text Arabic display with interactive word-by-word rendering where each word is clickable and shows a definition popover. Applied to **both** the `/search` results page and the `/quran` reader page via a shared `InteractiveArabicText` component.

**Shared component architecture:**
- `app/components/InteractiveArabicText.tsx` — single shared component used by both screens:
  - Accepts `chapter`, `verse`, and optional `uthmaniText` (fallback) props
  - Lazy-loads the word-by-word JSON for the surah (`/quran/words/{chapter}.json`) with an in-memory `Map` cache
  - Renders each word as a clickable `<span>` with hover highlight and active state
  - Falls back to plain `ArabicText` if word data isn't available (e.g., hadith, loading state)
  - Integrates `WordPopover` — on word click, shows popover anchored to the clicked span
  - Only one popover open at a time; click outside or press Escape to dismiss
- `app/components/WordPopover.tsx` — popover component (via `@floating-ui/react`) showing:
  - **Arabic word** (large, Uthmani script) with transliteration underneath
  - **Translation** — the word-by-word English meaning from Quran.com data
  - **Root** — the 3-letter root displayed in Arabic (e.g., `ر ح م`)
  - **Lemma** — base word form
  - **Part of speech** — Noun, Verb, Particle, etc. (decoded from morphology string)
  - **Verb form** — if applicable, which of the 10 verb forms (Form I, II, etc.)

**Integration points (both use `InteractiveArabicText`):**
- `app/components/SearchResults.tsx` — Quran search results use `InteractiveArabicText`; hadith results still use plain `ArabicText`
- `app/quran/page.client.tsx` — Quran reader page uses `InteractiveArabicText` for every verse

**Other changes:**
- `types/index.ts` — added `QuranWord` and `SurahWordData` type definitions
- `app/globals.css` — `.interactive-word` hover/active styles, `.word-popover-enter` animation
- `package.json` — added `@floating-ui/react` dependency

**Test plan:**
- `/search` — Quran results show clickable words; clicking shows popover with correct data
- `/quran` — every verse renders as clickable words with the same popover behavior
- Hadith results still show plain `ArabicText` (no regression)
- Click a different word → popover moves to new word
- Click outside or Escape → dismisses popover
- Popover doesn't overflow viewport (Floating UI handles repositioning)
- Mobile: popover is usable on touch
- RTL layout correct on both screens
- Performance: word JSON loads lazily and is cached across verses in the same surah

**Rollback:** Revert `SearchResults.tsx` and `page.client.tsx` to use `<ArabicText>` directly. `InteractiveArabicText` and `WordPopover` are additive.

---

## Phase 4: Root Cross-References ("Other words from this root")

**Goal:** Extend the word popover to show other Quran verses that use words from the same root, enabling cross-reference exploration.

**Changes:**
- `app/components/WordPopover.tsx` — add "Root Exploration" section:
  - Load `roots.json` (from Phase 1) to find all occurrences of the clicked word's root
  - Show occurrence count: "This root appears in X verses"
  - List 3-5 sample verses with their word-in-context (lazy-loaded from per-surah word files)
  - "See all N verses" link that triggers a search for the root
- `app/components/InteractiveArabicText.tsx` — pass root-lookup data to `WordPopover`
- `lib/roots.ts` — utility to load and cache the roots index, with lookup functions:
  - `getRootOccurrences(root: string): { surah: number, verse: number, position: number }[]`
  - `getRootCount(root: string): number`

**Dependencies:** Phase 2+3 (shared `WordPopover` must exist), Phase 1 (roots.json must exist)

**Scope:** Changes to `WordPopover.tsx` automatically apply to **both** `/search` and `/quran` screens since they share `InteractiveArabicText`.

**Test plan:**
- Click a common root word (e.g., any word from root ر ح م "mercy") — popover shows occurrence count and sample verses on **both** `/search` and `/quran` pages
- Click "See all N verses" — navigates to search page with the root as query
- Verify occurrence counts match known values (e.g., root ر ح م appears ~339 times in the Quran)
- Performance: roots.json loads once and is cached; no lag on subsequent word clicks

**Deploy notes:**
- Frontend-only. `roots.json` is a static file (~100-200KB estimated for 1,651 roots).
- Consider lazy-loading roots.json only when the first word is clicked (not on page load)

**Rollback:** Remove the root cross-reference section from `WordPopover`. Core word definition still works.

---

## Phase 5: Lane's Lexicon Integration — Deep Definitions

**Goal:** Enrich the word popover with scholarly Lane's Lexicon definitions for deeper etymological understanding of each root.

**Changes:**
- `quran_loader/ingest-lanes-lexicon.js` — new script that:
  - Downloads/processes [`quran-arabic-roots-lane-lexicon`](https://github.com/aliozdenisik/quran-arabic-roots-lane-lexicon) JSON
  - Generates `public/quran/words/lanes-lexicon.json` — keyed by root, containing Lane's definition text
  - Truncates definitions to a reasonable preview length (~500 chars) with full text available on expand
- `app/components/WordPopover.tsx` — add "Lane's Lexicon" expandable section:
  - Shows a brief definition preview from Lane's Lexicon for the word's root
  - "Read more" expands to full definition
  - Styled distinctly (scholarly/reference appearance — serif font, muted colors)
  - Attribution: "Definition from Lane's Arabic-English Lexicon"
- `lib/lanes-lexicon.ts` — utility to lazy-load and cache Lane's data, with lookup by root

**Dependencies:** Phase 2+3 (shared `WordPopover` must exist)

**Scope:** Changes to `WordPopover.tsx` automatically apply to **both** `/search` and `/quran` screens since they share `InteractiveArabicText`.

**Test plan:**
- Click a word on **both** `/search` and `/quran` pages → Lane's Lexicon section appears with relevant definition
- Verify definitions match the actual Lane's Lexicon for 5-10 sample roots
- "Read more" expands correctly
- Words with roots not in Lane's → section gracefully hidden (no error)
- Performance: lexicon JSON loads lazily on first word click

**Deploy notes:**
- Static JSON file. Lane's Lexicon is public domain.
- File may be large (~2-5MB for 1,651 roots). Consider splitting into per-letter files (e.g., `lanes/alef.json`, `lanes/ba.json`) for faster loading.
- Add attribution in the popover UI

**Rollback:** Remove Lane's section from `WordPopover`. Core word definition and root cross-refs still work.

---

## Phase 6: OpenSearch Root Field — Root-Based Search

**Goal:** Add a `root` field to the OpenSearch `kitaab` index so users can search by Arabic root, and the "See all verses" link from Phase 4 returns precise results.

**Changes:**
- `quran_loader/migrate-root-field.js` — new migration script that:
  - Reads per-surah word files from Phase 1
  - For each verse, collects all unique roots from its words
  - Bulk-updates OpenSearch documents to add `root` field (array of root strings, e.g., `["ر ح م", "ع ل م", "ك ت ب"]`)
- `quran_loader/load-quran-to-search.js` — update index mapping to include:
  ```json
  "root": {
    "type": "keyword"
  }
  ```
- `functions/index.js` — update `searchDocuments()`:
  - Detect if query is an Arabic root (3 space-separated Arabic letters)
  - If so, use `term` query on `root` field instead of `match` on `text`
  - Add `root` to the response fields
- `app/components/WordPopover.tsx` — update "See all verses" link to use root-based search query (e.g., `?q=root:ر ح م`)

**Dependencies:** Phase 1 (word data with roots), Phase 4 (cross-reference UI)

**Test plan:**
- Run migration script, verify `root` field is populated on Quran documents
- Search for `root:ر ح م` via API — returns all verses containing words from the mercy root
- Search for `root:ك ت ب` — returns verses about writing/books
- Existing text/semantic/hybrid search is unaffected (no regression)
- "See all verses" link in popover correctly triggers root search

**Deploy notes:**
- **Database migration is its own phase** — run migration script against production OpenSearch after deploying the updated index mapping
- Backwards compatible — new field is additive, existing queries don't use it
- Deploy order: (1) update index mapping, (2) run migration, (3) deploy functions with root search, (4) deploy frontend

**Rollback:** Root field is additive. Remove root query logic from `functions/index.js` and revert "See all verses" link. Field can remain in index harmlessly.

---

## Phase 7: Semantic Disambiguation for Ambiguous Roots

**Goal:** Use OpenSearch semantic search to help users explore different meanings of ambiguous Arabic roots. When a root has multiple semantic fields (e.g., `عين` — eye / spring / essence), show grouped results by meaning.

**Changes:**
- `functions/index.js` — new API endpoint `/api/root-meanings`:
  - Accepts a root string
  - Queries OpenSearch with `term` filter on `root` field + KNN on embeddings
  - Clusters results by semantic similarity (simple approach: take top 20 results, group by embedding cosine distance)
  - Returns grouped results with representative verse per cluster
- `app/components/WordPopover.tsx` — for roots with high occurrence count (>50), add "Explore meanings" button:
  - Opens a panel/modal showing semantically grouped verse clusters
  - Each cluster shows a meaning label (derived from the English translations of its verses) and 2-3 example verses
  - Clicking a verse navigates to it in search results

**Dependencies:** Phase 6 (root field in OpenSearch), existing semantic search infrastructure

**Scope:** Changes to `WordPopover.tsx` automatically apply to **both** `/search` and `/quran` screens since they share `InteractiveArabicText`.

**Test plan:**
- Test with known ambiguous roots (عين, عمل, قلب) on **both** `/search` and `/quran` pages
- Verify clusters represent meaningfully different usages
- Verify non-ambiguous roots (roots with consistent meaning) show a single cluster
- API response time is acceptable (<2s for clustering)

**Deploy notes:**
- New API endpoint — deploy Firebase Function first, then frontend
- Clustering is lightweight (cosine distance on 20 vectors) — no additional infrastructure needed
- Consider caching cluster results in Firestore for frequently looked-up roots

**Rollback:** Remove "Explore meanings" button from popover. Root search (Phase 6) still works.

---

## Phase 8: Hadith Word Support — CAMeL Tools Microservice

**Goal:** Extend word-level interactions to hadith (Bukhari) text by deploying a morphological analysis service that can process arbitrary Arabic text at runtime.

**Changes:**
- `services/arabic-morphology/` — new Python microservice:
  - Uses [CAMeL Tools](https://github.com/CAMeL-Lab/camel_tools) (`pip install camel-tools`) for morphological analysis
  - Endpoints:
    - `POST /analyze` — accepts Arabic text, returns word-by-word analysis (root, lemma, POS, translation via Hans Wehr lookup)
    - `POST /segment` — accepts Arabic text, returns segmented tokens with clitic boundaries
  - Deployed as a Cloud Run service (Python 3.10+, ~512MB memory for CAMeL models)
  - Results cached in Firestore by text hash to avoid repeated analysis
- `quran_loader/ingest-hans-wehr.js` — script to extract entries from `hanswehr.sqlite` and generate `hans-wehr.json` for the microservice to use as a translation dictionary
- `functions/index.js` — update search API:
  - For hadith results, call the morphology service to get word-by-word data
  - Cache results in Firestore keyed by `{chapter}_{verse}_{volume}`
- `app/components/InteractiveArabicText.tsx` — extend to support hadith:
  - For hadith results, fetch word analysis from API (instead of static JSON)
  - Same clickable word UI and popover as Quran text

**Dependencies:** Phase 2+3 (shared `InteractiveArabicText` + `WordPopover`), Phase 6 (root field concept)

**Scope:** `InteractiveArabicText` already supports a fallback mode. Phase 8 extends it with an API-based word data source for hadith, reusing the same clickable word UI and `WordPopover` across all screens.

**Test plan:**
- Send sample hadith Arabic text to `/analyze` endpoint — verify root extraction accuracy
- Compare CAMeL Tools output against known morphological analyses
- Hadith search results show clickable Arabic words with the same popover as Quran
- Quran word lookup still uses static JSON on **both** `/search` and `/quran` (no regression, no API call)
- Microservice handles edge cases: Arabic text with no diacritics, mixed Arabic/English, empty strings

**Deploy notes:**
- **New infrastructure** — Cloud Run service with CAMeL Tools. Requires:
  - Docker container with Python 3.10 + camel-tools + pre-downloaded models (~1.5GB)
  - Cloud Run service with 512MB-1GB memory, auto-scaling 0-5 instances
  - Service account with Firestore access for caching
- Deploy order: (1) Cloud Run service, (2) Firebase Functions update, (3) Frontend update
- Initially mark as beta/experimental in the UI

**Rollback:** Disable hadith word interactions in `InteractiveArabicText` (check `title === 'quran'` only). Cloud Run service can be scaled to 0.

---

## Conflicts & Decision Points

### 1. Static JSON vs. API-First for Quran Word Data

**Conflict:** Phase 1 uses static JSON files (`public/quran/words/`), while Phase 8 introduces an API-based approach for hadith. Should we unify?

**Options:**
- **Option A (recommended): Static JSON for Quran, API for hadith.** Quran word data is fixed and complete — static files give instant loading with no API cost. Hadith requires runtime analysis since pre-computed data doesn't exist for all collections.
- **Option B: API-first for everything.** Build the morphology service first, use it for both Quran and hadith. Simpler architecture but adds latency and cost for Quran lookups that don't need it.

**Recommendation:** Option A. The Quran's word-by-word data is a solved problem with complete pre-computed datasets. Adding an API layer would only add latency and cost for no benefit.

### 2. Lane's Lexicon File Size

**Conflict:** Lane's Lexicon JSON could be 2-5MB, which is large for a static file loaded in the browser.

**Options:**
- **Option A (recommended): Split by first letter of root.** ~28 files of 100-200KB each. Load only the relevant file when a word is clicked.
- **Option B: Load full file lazily.** One large file, loaded on first word click and cached. Simpler but slower first-load.
- **Option C: Move to API.** Serve Lane's data from a Firebase Function or Firestore lookup. More infrastructure but smallest client payload.

**Recommendation:** Option A. Keeps it static (no infrastructure) while keeping individual loads small.

### 3. CAMeL Tools Deployment (Phase 8)

**Conflict:** CAMeL Tools requires a Python runtime with ~1.5GB of NLP models. This is a significant infrastructure addition for a Firebase/Node.js stack.

**Options:**
- **Option A (recommended): Cloud Run.** Deploy as a separate service, auto-scales to 0 when unused. Pay only for invocations.
- **Option B: Pre-compute all hadith word data.** Run CAMeL Tools offline, generate static JSON like Quran data. No runtime service needed, but only covers currently indexed hadith.
- **Option C: Use lighter tools.** NLTK ISRIStemmer (Python) or a JS port for basic stemming. Less accurate but no heavy models.

**Recommendation:** Option B for Bukhari (it's a fixed corpus), then Option A only if the app expands to more Arabic text collections that can't be pre-computed.

### 4. OpenSearch Index Mapping Update (Phase 6)

**Conflict:** Adding the `root` field requires an index mapping update. On a live index, new fields can be added without reindexing, but the bulk update to populate existing documents requires care.

**Decision:** The migration script (Phase 6) uses the same bulk update pattern as the existing `migrate-arabic-metadata.js`. Run during a low-traffic window. The field is additive — no existing queries are affected during the migration window.
