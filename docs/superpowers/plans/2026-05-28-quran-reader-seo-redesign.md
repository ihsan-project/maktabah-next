# Quran Reader SEO Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the client-only `/quran` reader (which 404s on App Hosting because `public/` isn't served) with per-verse, SEO-indexable, CDN-cached pages whose data is baked in at build time.

**Architecture:** Path-based routes `/quran`, `/quran/[surah]`, `/quran/[surah]/[verse]`. Verse/translation JSON moves to a build-only `data/quran/` dir, read via `lib/quran-data.ts` and rendered server-side into HTML. Verse pages render on-demand (`revalidate = false`, empty `generateStaticParams`) and emit a long `Cache-Control` so Cloud CDN holds them. Word-morphology JSON moves to Firebase Storage, served via the existing `/api/storage` proxy. `robots`/`sitemap` become native metadata routes.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, Firebase App Hosting (Cloud Run + Cloud CDN), Firebase Storage + firebase-admin.

**Testing approach:** Verification-driven (matching the repo convention — no test framework). Each task verifies with `npx tsc --noEmit`, `npm run dev` + `curl`, `npm run build`, and view-source greps.

---

## File Structure

**Create:**
- `data/quran/{1..114}.json`, `data/quran/metadata.json` — moved from `public/quran/` (build-only data)
- `lib/quran-data.ts` — typed, cached server-side data loader
- `lib/highlight.tsx` — shared highlight helpers (extracted from `TranslationCarousel`)
- `app/quran/[surah]/page.tsx` — surah landing (static, all 114 prebuilt)
- `app/quran/[surah]/[verse]/page.tsx` — verse page (on-demand, CDN-cached)
- `app/quran/[surah]/[verse]/VerseClient.tsx` — client islands wrapper
- `app/components/VerseTranslations.tsx` — client list of all translations w/ selector filtering + highlight
- `app/robots.ts`, `app/sitemap.ts` — SEO metadata routes
- `middleware.ts` — legacy `?start=` redirect
- `quran_loader/upload-words-to-storage.js` — one-time word-data upload script

**Modify:**
- `next.config.js` — `outputFileTracingIncludes` + verse-route `headers()`
- `app/quran/page.tsx` — becomes the surah index
- `app/components/InteractiveArabicText.tsx` — repoint word fetch to `/api/storage`
- `lib/quran-utils.ts` — rewrite `buildContextUrl`; drop now-unused fetch/range helpers
- `app/components/WordMorphologyContent.tsx` — use `buildContextUrl`
- `package.json` — drop `prebuild` sitemap hook

**Delete:**
- `app/quran/page.client.tsx`, `public/quran/` (after upload), `public/robots.txt`, `public/sitemap.xml`, `scripts/generate-sitemap.js`

---

## Task 1: Relocate Quran data to build-only `data/quran/`

**Files:**
- Move: `public/quran/{1..114}.json` + `public/quran/metadata.json` → `data/quran/`
- Keep (for now): `public/quran/words/` (handled in Task 9)

- [ ] **Step 1: Move the verse JSON and metadata (not the words/ subdir)**

```bash
mkdir -p data/quran
git mv public/quran/metadata.json data/quran/metadata.json
for f in public/quran/[0-9]*.json; do git mv "$f" "data/quran/$(basename "$f")"; done
```

- [ ] **Step 2: Verify the move**

Run: `ls data/quran | wc -l && ls public/quran` 
Expected: `115` (114 surahs + metadata.json) in `data/quran`; `public/quran` now contains only `words/`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "refactor: move Quran verse data to build-only data/quran"
```

---

## Task 2: Build-time data loader + file tracing

**Files:**
- Create: `lib/quran-data.ts`
- Modify: `next.config.js`

- [ ] **Step 1: Create `lib/quran-data.ts`**

```ts
import fs from 'fs';
import path from 'path';
import type { SurahData, QuranMetadata, QuranVerse } from './quran-utils';

const DATA_DIR = path.join(process.cwd(), 'data', 'quran');

let metadataCache: QuranMetadata | null = null;
const surahCache = new Map<number, SurahData>();

export function getMetadata(): QuranMetadata {
  if (!metadataCache) {
    metadataCache = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'metadata.json'), 'utf-8'),
    ) as QuranMetadata;
  }
  return metadataCache;
}

export function getSurah(index: number): SurahData {
  const cached = surahCache.get(index);
  if (cached) return cached;
  const data = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, `${index}.json`), 'utf-8'),
  ) as SurahData;
  surahCache.set(index, data);
  return data;
}

export function isValidRef(surah: number, verse: number): boolean {
  const meta = getMetadata();
  const s = meta.surahs.find((x) => x.index === surah);
  return !!s && verse >= 1 && verse <= s.verseCount;
}

function toVerse(data: SurahData, surah: number, verse: number): QuranVerse | null {
  const vd = data.verses[String(verse)];
  if (!vd) return null;
  return { surah, verse, surahName: data.name, arabic: vd.arabic, translations: vd.translations };
}

export function getVerse(surah: number, verse: number): QuranVerse | null {
  if (!isValidRef(surah, verse)) return null;
  return toVerse(getSurah(surah), surah, verse);
}

export function getContext(surah: number, verse: number, radius: number): QuranVerse[] {
  const data = getSurah(surah);
  const out: QuranVerse[] = [];
  const from = Math.max(1, verse - radius);
  const to = Math.min(data.verseCount, verse + radius);
  for (let v = from; v <= to; v++) {
    const item = toVerse(data, surah, v);
    if (item) out.push(item);
  }
  return out;
}

export interface AdjacentRefs {
  prev: { surah: number; verse: number } | null;
  next: { surah: number; verse: number } | null;
}

export function getAdjacent(surah: number, verse: number): AdjacentRefs {
  const surahs = getMetadata().surahs;
  const cur = surahs.find((s) => s.index === surah);
  if (!cur) return { prev: null, next: null };

  let prev: AdjacentRefs['prev'] = null;
  if (verse > 1) prev = { surah, verse: verse - 1 };
  else if (surah > 1) {
    const p = surahs.find((s) => s.index === surah - 1);
    if (p) prev = { surah: surah - 1, verse: p.verseCount };
  }

  let next: AdjacentRefs['next'] = null;
  if (verse < cur.verseCount) next = { surah, verse: verse + 1 };
  else if (surah < 114) next = { surah: surah + 1, verse: 1 };

  return { prev, next };
}
```

- [ ] **Step 2: Add file tracing to `next.config.js`**

In `next.config.js`, extend the `experimental` block and add a `headers()` entry. Replace the existing `experimental` object:

```js
  experimental: {
    forceSwcTransforms: true,
    outputFileTracingIncludes: {
      '/quran/[surah]': ['./data/quran/**/*'],
      '/quran/[surah]/[verse]': ['./data/quran/**/*'],
      '/sitemap.xml': ['./data/quran/**/*'],
    },
  },
```

(The `headers()` for caching is added in Task 7.)

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/quran-data.ts next.config.js && git commit -m "feat: add build-time Quran data loader with file tracing"
```

---

## Task 3: Surah index page at `/quran`

**Files:**
- Modify: `app/quran/page.tsx`
- Delete: `app/quran/page.client.tsx`

- [ ] **Step 1: Replace `app/quran/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { getMetadata } from '@/lib/quran-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  title: 'Quran Reader — 17 English Translations | Maktabah',
  description: 'Read the Quran in Arabic with 17 English translations. Browse all 114 surahs verse by verse.',
  alternates: { canonical: `${SITE}/quran` },
  openGraph: { title: 'Quran Reader — Maktabah', description: 'Read the Quran with 17 English translations.', url: `${SITE}/quran`, type: 'website' },
};

export default function QuranIndexPage() {
  const meta = getMetadata();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Quran Reader — Maktabah',
    url: `${SITE}/quran`,
    isPartOf: { '@type': 'WebSite', name: 'Maktabah', url: SITE },
  };
  return (
    <div className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-bold text-center text-primary mb-2">Quran Reader</h1>
      <p className="text-center text-gray-600 mb-6">Browse all 114 surahs with 17 English translations</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {meta.surahs.map((s) => (
          <Link
            key={s.index}
            href={`/quran/${s.index}`}
            className="block px-3 py-2 rounded-md bg-white shadow-sm hover:bg-gray-50 transition-colors text-sm"
          >
            <span className="text-gray-400 mr-1">{s.index}.</span>
            {s.name}
            <span className="block text-xs text-gray-400">{s.verseCount} verses</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old client reader**

```bash
git rm app/quran/page.client.tsx
```

- [ ] **Step 3: Verify it renders server-side**

Run: `npm run dev` (wait for "Ready"), then in another shell:
`curl -s localhost:3000/quran | grep -c "Al-Baqarah"`
Expected: `>= 1` (surah name present in SSR HTML). Stop dev after.

- [ ] **Step 4: Commit**

```bash
git add app/quran/page.tsx && git commit -m "feat: replace /quran with server-rendered surah index"
```

---

## Task 4: Surah landing page `/quran/[surah]`

**Files:**
- Create: `app/quran/[surah]/page.tsx`

- [ ] **Step 1: Create `app/quran/[surah]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMetadata, getSurah } from '@/lib/quran-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return getMetadata().surahs.map((s) => ({ surah: String(s.index) }));
}

function parseSurah(param: string) {
  const n = Number(param);
  if (!Number.isInteger(n) || n < 1 || n > 114) return null;
  return n;
}

export function generateMetadata({ params }: { params: { surah: string } }): Metadata {
  const idx = parseSurah(params.surah);
  if (!idx) return {};
  const s = getMetadata().surahs.find((x) => x.index === idx)!;
  const url = `${SITE}/quran/${idx}`;
  return {
    title: `Surah ${s.name} (${idx}) — ${s.verseCount} verses | Maktabah`,
    description: `Read Surah ${s.name}, the ${idx}th chapter of the Quran (${s.verseCount} verses), in Arabic with 17 English translations.`,
    alternates: { canonical: url },
    openGraph: { title: `Surah ${s.name} — Maktabah`, url, type: 'website' },
  };
}

export default function SurahPage({ params }: { params: { surah: string } }) {
  const idx = parseSurah(params.surah);
  if (!idx) notFound();
  const surah = getSurah(idx);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: `Surah ${surah.name}`,
    url: `${SITE}/quran/${idx}`,
    isPartOf: { '@type': 'CreativeWork', name: 'The Quran' },
  };
  return (
    <div className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500 mb-4"><Link href="/quran" className="hover:underline">Quran</Link> › {surah.name}</nav>
      <h1 className="text-3xl font-bold text-center text-primary mb-6">Surah {surah.name} <span className="text-gray-400 text-xl">({idx})</span></h1>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {Array.from({ length: surah.verseCount }, (_, i) => i + 1).map((v) => (
          <Link key={v} href={`/quran/${idx}/${v}`} className="text-center px-2 py-2 rounded-md bg-white shadow-sm hover:bg-gray-50 text-sm">
            {idx}:{v}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run dev`, then `curl -s localhost:3000/quran/2 | grep -c "Al-Baqarah"` → `>= 1`; `curl -s -o /dev/null -w "%{http_code}" localhost:3000/quran/200` → `404`.

- [ ] **Step 3: Commit**

```bash
git add app/quran/\[surah\]/page.tsx && git commit -m "feat: add static surah landing page"
```

---

## Task 5: Shared highlight helper + translations list component

**Files:**
- Create: `lib/highlight.tsx`
- Create: `app/components/VerseTranslations.tsx`
- Modify: `app/components/TranslationCarousel.tsx` (import shared helper)

- [ ] **Step 1: Create `lib/highlight.tsx`**

```tsx
import React from 'react';

export function highlightMatches(text: string, term: string): React.ReactNode[] {
  if (!term) return [text];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.split(regex).map((part, i) => (regex.test(part) ? <mark key={i}>{part}</mark> : part));
}

export function TextWithLineBreaks({ text, highlightTerm }: { text: string; highlightTerm?: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? 'mt-2' : ''}>
          {highlightTerm ? highlightMatches(line, highlightTerm) : line}
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Point `TranslationCarousel` at the shared helper**

In `app/components/TranslationCarousel.tsx`, delete the local `highlightMatches` function (lines ~24-32) and the local `TextWithLineBreaks` (lines ~34-45), and add at the top:

```tsx
import { TextWithLineBreaks } from '@/lib/highlight';
```

- [ ] **Step 3: Create `app/components/VerseTranslations.tsx`**

```tsx
'use client';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { TextWithLineBreaks } from '@/lib/highlight';
import type { Translation } from '@/lib/quran-utils';
import { getBookIdForAuthor } from '@/lib/quran-utils';

interface Props {
  translations: Translation[];
  verseRef: string;          // "2:255"
  selectedAuthors: string[]; // authors to keep visible
}

export default function VerseTranslations({ translations, verseRef, selectedAuthors }: Props) {
  const highlight = useSearchParams().get('highlight') || undefined;
  const [chapter, verse] = verseRef.split(':');
  return (
    <div className="space-y-3 mt-4">
      {translations.map((t) => {
        const hidden = !selectedAuthors.includes(t.author);
        return (
          <div key={t.author} className={`bg-white rounded-lg shadow-sm p-4 border border-gray-200 ${hidden ? 'hidden' : ''}`}>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold text-primary text-sm">{t.author}</h4>
              <a
                href={`https://tanzil.net/#trans/${getBookIdForAuthor(t.author)}/${chapter}:${verse}`}
                target="_blank" rel="noopener noreferrer"
                className="text-xs text-primary hover:underline"
              >tanzil.net</a>
            </div>
            <div className={`text-gray-700 text-sm leading-relaxed${highlight ? ' quran-highlight' : ''}`}>
              <TextWithLineBreaks text={t.text} highlightTerm={highlight} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/highlight.tsx app/components/VerseTranslations.tsx app/components/TranslationCarousel.tsx
git commit -m "feat: add verse translations list and shared highlight helper"
```

---

## Task 6: Verse page (on-demand) + client islands

**Files:**
- Create: `app/quran/[surah]/[verse]/VerseClient.tsx`
- Create: `app/quran/[surah]/[verse]/page.tsx`

- [ ] **Step 1: Create `app/quran/[surah]/[verse]/VerseClient.tsx`**

```tsx
'use client';

import React, { useState, useCallback } from 'react';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import VerseTranslations from '@/app/components/VerseTranslations';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider } from '@/app/contexts/WordDictionaryContext';
import type { QuranVerse } from '@/lib/quran-utils';

interface Props {
  focal: QuranVerse;
  allAuthors: string[];
}

export default function VerseClient({ focal, allAuthors }: Props) {
  // Initialize to all authors so SSR + first client render show every translation (SEO).
  const [selected, setSelected] = useState<string[]>(allAuthors);
  const onChange = useCallback((s: string[]) => setSelected(s), []);

  return (
    <WordDictionaryProvider>
      <div className="px-4 pt-2 pb-4">
        <InteractiveArabicText
          chapter={focal.surah}
          verse={focal.verse}
          uthmaniText={focal.arabic}
          className="text-gray-800 text-center"
          useDrawer
        />
      </div>
      <TranslatorSelector availableTranslators={allAuthors} onSelectionChange={onChange} />
      <VerseTranslations
        translations={focal.translations}
        verseRef={`${focal.surah}:${focal.verse}`}
        selectedAuthors={selected}
      />
      <WordDrawer className="hidden dict:flex" />
      <WordBottomSheet className="dict:hidden" />
    </WordDictionaryProvider>
  );
}
```

- [ ] **Step 2: Create `app/quran/[surah]/[verse]/page.tsx`**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ArabicText from '@/app/components/ArabicText';
import VerseClient from './VerseClient';
import { getMetadata, getVerse, getContext, getAdjacent } from '@/lib/quran-data';

export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  return [] as { surah: string; verse: string }[];
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';
const RADIUS = 2;

function parseRef(params: { surah: string; verse: string }) {
  const surah = Number(params.surah);
  const verse = Number(params.verse);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return null;
  return { surah, verse };
}

export function generateMetadata({ params }: { params: { surah: string; verse: string } }): Metadata {
  const ref = parseRef(params);
  const v = ref ? getVerse(ref.surah, ref.verse) : null;
  if (!ref || !v) return {};
  const sahih = v.translations.find((t) => t.author === 'Saheeh International') || v.translations[0];
  const desc = (sahih?.text || `Quran ${ref.surah}:${ref.verse}`).slice(0, 155);
  const url = `${SITE}/quran/${ref.surah}/${ref.verse}`;
  return {
    title: `Quran ${ref.surah}:${ref.verse} — ${v.surahName} | Maktabah`,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: `Quran ${ref.surah}:${ref.verse} — ${v.surahName}`, description: desc, url, type: 'article' },
  };
}

export default function VersePage({ params }: { params: { surah: string; verse: string } }) {
  const ref = parseRef(params);
  const focal = ref ? getVerse(ref.surah, ref.verse) : null;
  if (!ref || !focal) notFound();

  const context = getContext(ref.surah, ref.verse, RADIUS);
  const { prev, next } = getAdjacent(ref.surah, ref.verse);
  const allAuthors = getMetadata().translators;
  const sahih = focal.translations.find((t) => t.author === 'Saheeh International') || focal.translations[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: `Quran ${ref.surah}:${ref.verse}`,
    inLanguage: ['ar', 'en'],
    text: sahih?.text,
    url: `${SITE}/quran/${ref.surah}/${ref.verse}`,
    isPartOf: { '@type': 'CreativeWork', name: `Surah ${focal.surahName}`, url: `${SITE}/quran/${ref.surah}` },
  };

  return (
    <div className="py-8 max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/quran" className="hover:underline">Quran</Link> ›{' '}
        <Link href={`/quran/${ref.surah}`} className="hover:underline">{focal.surahName}</Link> › Verse {ref.verse}
      </nav>
      <h1 className="text-2xl font-bold text-center text-primary mb-6">{focal.surahName} {ref.surah}:{ref.verse}</h1>

      {/* Context above focal (server-rendered, dimmed, non-interactive) */}
      {context.filter((c) => c.verse < ref.verse).map((c) => (
        <ContextVerse key={c.verse} surah={ref.surah} verse={c.verse} arabic={c.arabic} translation={c.translations.find((t) => t.author === 'Saheeh International')?.text || c.translations[0]?.text} />
      ))}

      {/* Focal verse — interactive + all translations (client islands) */}
      <div className="my-6 ring-2 ring-primary/20 rounded-lg p-2" id={`v${ref.verse}`}>
        <VerseClient focal={focal} allAuthors={allAuthors} />
      </div>

      {/* Context below focal */}
      {context.filter((c) => c.verse > ref.verse).map((c) => (
        <ContextVerse key={c.verse} surah={ref.surah} verse={c.verse} arabic={c.arabic} translation={c.translations.find((t) => t.author === 'Saheeh International')?.text || c.translations[0]?.text} />
      ))}

      {/* Prev/next */}
      <div className="mt-8 flex justify-between text-sm">
        {prev ? <Link href={`/quran/${prev.surah}/${prev.verse}`} className="text-primary hover:underline">← {prev.surah}:{prev.verse}</Link> : <span />}
        {next ? <Link href={`/quran/${next.surah}/${next.verse}`} className="text-primary hover:underline">{next.surah}:{next.verse} →</Link> : <span />}
      </div>
    </div>
  );
}

function ContextVerse({ surah, verse, arabic, translation }: { surah: number; verse: number; arabic: string; translation?: string }) {
  return (
    <Link href={`/quran/${surah}/${verse}`} className="block opacity-50 hover:opacity-80 transition-opacity py-2">
      <ArabicText size="base" className="text-gray-700 text-center">{arabic}</ArabicText>
      {translation && <p className="text-xs text-gray-500 mt-1">{surah}:{verse} — {translation}</p>}
    </Link>
  );
}
```

- [ ] **Step 3: Add `rel=prev/next` link tags**

Next 14 App Router does not emit `<link rel="prev/next">` from metadata. Add them in `generateMetadata` via the `other`/`alternates`? Use the `Metadata` `alternates` is for canonical only. Instead emit them in the page body inside `<head>` is not allowed in App Router pages. Use `generateMetadata` returning `other` won't produce rel=prev. **Decision:** include prev/next as visible `<a>` links (done in Step 2) — Google treats in-body pagination links as valid crawl signals (rel=prev/next is no longer used by Google for indexing). No extra `<link>` tags needed.

- [ ] **Step 4: Verify content is server-rendered + 404 works**

Run: `npm run dev`, then:
- `curl -s localhost:3000/quran/2/255 | grep -c "Saheeh International"` → `>= 1` (translation in SSR HTML)
- `curl -s localhost:3000/quran/2/255 | grep -c "All-Knowing\|Throne\|Living"` → `>= 1` (Ayat al-Kursi text present)
- `curl -s -o /dev/null -w "%{http_code}" localhost:3000/quran/2/9999` → `404`

- [ ] **Step 5: Verify build does NOT prerender all verses**

Run: `npm run build 2>&1 | grep -E "/quran"`
Expected: `/quran` and `/quran/[surah]` listed as static/prerendered; `/quran/[surah]/[verse]` shown as a dynamic/on-demand route (ƒ or similar), NOT 6,236 prerendered entries.

- [ ] **Step 6: Commit**

```bash
git add app/quran/\[surah\]/\[verse\]/ && git commit -m "feat: add on-demand per-verse page with context and translations"
```

---

## Task 7: Long-lived cache headers for verse pages

**Files:**
- Modify: `next.config.js`

- [ ] **Step 1: Add a `headers()` rule in `next.config.js`**

Add this method to `nextConfig` (alongside `rewrites`):

```js
  async headers() {
    return [
      {
        source: '/quran/:surah/:verse',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
```

- [ ] **Step 2: Verify the header is emitted in a production server**

Run: `npm run build && npm run start` (production server on :3000), then:
`curl -sI localhost:3000/quran/2/255 | grep -i cache-control`
Expected: contains `s-maxage=31536000` and `public` (not `private`/`no-store`). Stop the server after.

> If Next overrides this header for the dynamic page, fall back to setting it in `middleware.ts` for `/quran/:surah/:verse` instead. Record the working mechanism in the spec's Verification note.

- [ ] **Step 3: Commit**

```bash
git add next.config.js && git commit -m "feat: long-lived Cache-Control for verse pages (CDN caching)"
```

---

## Task 8: Repoint word-morphology fetch to the Storage proxy

**Files:**
- Modify: `app/components/InteractiveArabicText.tsx`
- Modify: `app/api/storage/[...path]/route.ts`

- [ ] **Step 1: Change the fetch URL in `InteractiveArabicText.tsx`**

Replace line ~15:

```tsx
    const res = await fetch(`/api/storage/quran/words/${chapter}.json`);
```

- [ ] **Step 2: Lengthen the proxy cache for immutable data**

In `app/api/storage/[...path]/route.ts`, change the `Cache-Control` header (line ~34) to:

```ts
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable',
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (Functional verification of the fetch happens in Task 9 after upload.)

- [ ] **Step 4: Commit**

```bash
git add app/components/InteractiveArabicText.tsx app/api/storage/\[...path\]/route.ts
git commit -m "feat: serve Quran word data from Storage proxy"
```

---

## Task 9: Upload word data to Storage, then drop `public/quran`

**Files:**
- Create: `quran_loader/upload-words-to-storage.js`
- Delete: `public/quran/` (entire directory)

> **Caution:** Step 2 writes to the shared Firebase Storage bucket. Run it with the project owner's credentials and confirm before executing.

- [ ] **Step 1: Create `quran_loader/upload-words-to-storage.js`**

```js
/**
 * One-time: upload public/quran/words/*.json to Firebase Storage at quran/words/{n}.json.
 * Usage: GOOGLE_APPLICATION_CREDENTIALS=path/to/serviceAccount.json node quran_loader/upload-words-to-storage.js
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const BUCKET = 'maktabah-8ac04.firebasestorage.app';
const SRC = path.join(__dirname, '..', 'public', 'quran', 'words');

admin.initializeApp({ storageBucket: BUCKET });
const bucket = admin.storage().bucket();

async function main() {
  const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    const dest = `quran/words/${f}`;
    await bucket.upload(path.join(SRC, f), {
      destination: dest,
      metadata: { contentType: 'application/json', cacheControl: 'public, max-age=31536000, immutable' },
    });
    console.log('uploaded', dest);
  }
  console.log(`Done: ${files.length} files.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the upload (confirm credentials first)**

Run: `GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node quran_loader/upload-words-to-storage.js`
Expected: `Done: 144 files.`

- [ ] **Step 3: Verify a word file is reachable through the proxy**

Run: `npm run dev`, then `curl -s -o /dev/null -w "%{http_code}" "localhost:3000/api/storage/quran/words/1.json"`
Expected: `200`. (Requires the dev server to reach real Storage; if the emulator is used in dev, verify against the deployed site post-rollout instead.)

- [ ] **Step 4: Remove the now-unneeded public data**

```bash
git rm -r public/quran
```

- [ ] **Step 5: Commit**

```bash
git add quran_loader/upload-words-to-storage.js && git commit -m "feat: upload word data to Storage and remove public/quran"
```

---

## Task 10: `app/robots.ts`

**Files:**
- Create: `app/robots.ts`
- Delete: `public/robots.txt`

- [ ] **Step 1: Create `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
```

- [ ] **Step 2: Remove the static file**

```bash
git rm public/robots.txt
```

- [ ] **Step 3: Verify**

Run: `npm run dev`, then `curl -s localhost:3000/robots.txt`
Expected: contains `Disallow: /api/` and `Sitemap: https://maktabah.app/sitemap.xml`.

- [ ] **Step 4: Commit**

```bash
git add app/robots.ts && git commit -m "feat: serve robots.txt via metadata route"
```

---

## Task 11: `app/sitemap.ts`

**Files:**
- Create: `app/sitemap.ts`
- Delete: `public/sitemap.xml`, `scripts/generate-sitemap.js`
- Modify: `package.json` (remove `prebuild`)

- [ ] **Step 1: Confirm the stories export name**

Run: `grep -n "ALLOWED_STORIES" lib/story-config.ts`
Expected: an exported `ALLOWED_STORIES` array. If it is named differently, use that name in Step 2.

- [ ] **Step 2: Create `app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next';
import { getMetadata } from '@/lib/quran-data';
import { ALLOWED_STORIES } from '@/lib/story-config';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ['', '/quran', '/search', '/stories', '/developers', '/bookmarks'].map((p) => ({
    url: `${SITE}${p}`, lastModified: now,
  }));
  const stories = ALLOWED_STORIES.map((name) => ({ url: `${SITE}/story/${name}`, lastModified: now }));

  const surahs = getMetadata().surahs;
  const surahPages = surahs.map((s) => ({ url: `${SITE}/quran/${s.index}`, lastModified: now }));
  const versePages = surahs.flatMap((s) =>
    Array.from({ length: s.verseCount }, (_, i) => ({ url: `${SITE}/quran/${s.index}/${i + 1}`, lastModified: now })),
  );

  return [...staticPages, ...stories, ...surahPages, ...versePages];
}
```

- [ ] **Step 3: Remove the old generator and prebuild hook**

```bash
git rm public/sitemap.xml scripts/generate-sitemap.js
```

In `package.json`, delete the line:
```json
    "prebuild": "node scripts/generate-sitemap.js",
```

- [ ] **Step 4: Verify**

Run: `npm run dev`, then:
- `curl -s localhost:3000/sitemap.xml | grep -c "/quran/2/255"` → `1`
- `curl -s localhost:3000/sitemap.xml | grep -c "<url>"` → `>= 6300`

- [ ] **Step 5: Commit**

```bash
git add app/sitemap.ts package.json && git commit -m "feat: generate sitemap (incl. all verses) via metadata route"
```

---

## Task 12: Deep-link URLs + legacy redirect

**Files:**
- Modify: `lib/quran-utils.ts`
- Modify: `app/components/WordMorphologyContent.tsx`
- Create: `middleware.ts`

- [ ] **Step 1: Rewrite `buildContextUrl` in `lib/quran-utils.ts`**

Replace the existing `buildContextUrl` (lines ~116-133) with:

```ts
/**
 * Build a /quran verse URL, with an optional highlight term (applied client-side).
 */
export function buildContextUrl(chapter: number, verse: number, query?: string): string {
  const base = `/quran/${chapter}/${verse}`;
  return query ? `${base}?highlight=${encodeURIComponent(query)}` : base;
}
```

- [ ] **Step 2: Use it in `WordMorphologyContent.tsx`**

Replace the inline href (line ~291) `/quran?start=...&end=...` with:

```tsx
                        href={buildContextUrl(form.exampleSurah, form.exampleVerse)}
```

Add the import if missing: `import { buildContextUrl } from '@/lib/quran-utils';`

- [ ] **Step 3: Create `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';

export const config = { matcher: ['/quran'] };

export function middleware(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start'); // e.g. "2:255"
  if (!start) return NextResponse.next();
  const [s, v] = start.split(':');
  const surah = Number(s);
  const verse = Number(v);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/quran/${surah}/${verse}`;
  const highlight = req.nextUrl.searchParams.get('highlight');
  url.search = highlight ? `?highlight=${encodeURIComponent(highlight)}` : '';
  return NextResponse.redirect(url, 308);
}
```

- [ ] **Step 4: Verify deep-link + redirect**

Run: `npm run dev`, then:
- `curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "localhost:3000/quran?start=2:255&end=2:260"` → `308 .../quran/2/255`
- `curl -s "localhost:3000/quran/2/255?highlight=Throne" | grep -c "quran-highlight"` → `>= 1`

- [ ] **Step 5: Commit**

```bash
git add lib/quran-utils.ts app/components/WordMorphologyContent.tsx middleware.ts
git commit -m "feat: point deep-links to verse URLs and redirect legacy ranges"
```

---

## Task 13: Remove dead code + final verification

**Files:**
- Modify: `lib/quran-utils.ts`

- [ ] **Step 1: Find now-unused exports**

Run: `grep -rn "fetchSurahData\|fetchQuranMetadata\|DEFAULT_START\|DEFAULT_END" app lib --include=*.ts --include=*.tsx | grep -v "lib/quran-utils.ts"`
Expected: no results (only the definitions remain).

- [ ] **Step 2: Delete the unused functions/constants from `lib/quran-utils.ts`**

Remove `fetchSurahData`, `fetchQuranMetadata`, `getBasePath`, `DEFAULT_START`, `DEFAULT_END`. Keep `parseVerseRef`, `getBookIdForAuthor`, `buildContextUrl`, and all exported types/interfaces (still used by `quran-data.ts`, `VerseTranslations.tsx`, etc.).

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: all pass; build output shows `/quran` + `/quran/[surah]` prerendered and `/quran/[surah]/[verse]` dynamic.

- [ ] **Step 4: Commit**

```bash
git add lib/quran-utils.ts && git commit -m "refactor: remove dead Quran client-fetch helpers"
```

---

## Post-merge deployed smoke test (after rollout)

Not a code task — run against the deployed App Hosting URL once rolled out:

- [ ] `/quran/2/255` returns 200 with Arabic + translations in view-source.
- [ ] Response `Cache-Control` is the long-lived value; a second request is a CDN hit (`age` header increases / faster).
- [ ] `/robots.txt` and `/sitemap.xml` return 200; sitemap contains verse URLs.
- [ ] Word drawer: clicking a word loads `/api/storage/quran/words/{n}.json` (200) and opens.
- [ ] `/quran?start=2:255&end=2:260` 308-redirects to `/quran/2/255`.
- [ ] Confirm a new rollout invalidates the CDN cache (edit a verse's data in `data/quran`, deploy, confirm the page updates). If not, reduce `s-maxage` and note it.

## Self-Review Notes

- Spec coverage: routes (T3/T4/T6), data-at-build (T1/T2), on-demand+caching (T6/T7), word→Storage (T8/T9), robots/sitemap (T10/T11), deep-links+legacy redirect (T12), cleanup (T13). All spec sections mapped.
- Verse pages stay statically renderable: `?highlight=` is read only in client components (`VerseTranslations` via `useSearchParams`); no server `searchParams` use.
- Out of scope: `public/stories/*.xml` serving (flagged in spec) — not addressed here.
