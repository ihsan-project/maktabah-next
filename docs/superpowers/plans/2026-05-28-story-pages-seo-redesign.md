# Story Pages SEO Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `/story/[name]` pages to paginated, fully-static, server-rendered pages whose HTML contains real verse content (Arabic + a default translation), with story data converted from `public/stories/*.xml` to build-only `data/stories/*.json`.

**Architecture:** Page 1 stays at `/story/[name]`; pages 2+ live at `/story/[name]/[page]`, ~25 verses per page, all prebuilt via `generateStaticParams` (`dynamicParams = false`). A shared server component (`StoryReader`) renders breadcrumb/pagination/JSON-LD and delegates the verse list to a client island (`StoryReaderClient`) whose initial render — and therefore the SSR HTML — already contains the Arabic (joined from `lib/quran-data`) and the default translation. Mirrors the just-shipped Quran reader SEO migration.

**Tech Stack:** Next.js 14 (App Router, React 18.2), TypeScript, Tailwind. Data loaded at build via `fs` from `data/`. `xml2js` used only by a one-off conversion script.

**Testing convention:** This project has **no test framework** and uses **verification-driven** development (stated in both the Quran and story specs). Instead of TDD unit tests, each task ends with concrete verification commands (`tsc`, `build`, `curl`) and expected output, then a commit. Honor this convention — do not add a test framework.

**Spec:** [docs/superpowers/specs/2026-05-28-story-pages-seo-redesign-design.md](../specs/2026-05-28-story-pages-seo-redesign-design.md)

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `scripts/convert-stories.js` | One-off: parse `public/stories/*.xml` → write `data/stories/*.json` (translations only, no Arabic) | Create |
| `data/stories/*.json` | Build-only story data (13 files) | Create (generated + committed) |
| `lib/story-data.ts` | Typed loader: `listStories`, `getStoryPage`, `getStoryPageCount`; Arabic join + default-translator + pagination | Create |
| `app/components/TranslatorSelector.tsx` | Add optional `defaultSelection` prop (no-localStorage fallback) | Modify |
| `app/story/[name]/StoryReaderClient.tsx` | Client island: verse list + selector + carousel + drawer + sign-in banner (no virtual scroll) | Create |
| `app/story/[name]/StoryReader.tsx` | Shared server render of one page (breadcrumb, JSON-LD, `<link rel=prev/next>`, pagination) | Create |
| `app/story/[name]/page.tsx` | Page-1 route wrapper + metadata + `generateStaticParams` | Rewrite |
| `app/story/[name]/[page]/page.tsx` | Pages-2+ route wrapper + metadata + `generateStaticParams` | Create |
| `app/story/[name]/page.client.tsx` | Old monolithic client component | Delete |
| `middleware.ts` | Add `/story/:name/1` → 308 → `/story/:name` | Modify |
| `app/sitemap.ts` | Add `/stories` + all story pages (with pagination) | Modify |
| `next.config.js` | Cacheable `headers()` for `/story/...`; `data/stories` file-tracing for sitemap | Modify |
| `package.json` | Move `xml2js` to devDependencies; add `stories:convert` script | Modify |
| `public/stories/` | Source XML (after conversion) | Delete |

---

## Task 1: Conversion script + generate `data/stories/*.json`

**Files:**
- Create: `scripts/convert-stories.js`
- Create (generated): `data/stories/*.json`
- Modify: `package.json` (add `stories:convert` script)

- [ ] **Step 1: Verify the source directory and XML shape**

Run: `ls public/stories/ && head -c 600 public/stories/khadija.xml`
Expected: 13 `*.xml` files listed; XML shows `<story>` → `<metadata><title>…` and `<verses><verse chapter="…" verse="…"><translations><translation author="…"><text>…`.

- [ ] **Step 2: Create the conversion script**

Create `scripts/convert-stories.js`:

```js
const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const ALLOWED = [
  'adam', 'noah', 'abraham', 'ismail_ishaq', 'yusuf', 'ayyub', 'moses',
  'dawud', 'sulayman', 'yunus', 'maryam', 'jesus', 'khadija',
];
const SRC = path.join(process.cwd(), 'public', 'stories');
const OUT = path.join(process.cwd(), 'data', 'stories');

async function convert(name) {
  const xml = fs.readFileSync(path.join(SRC, `${name}.xml`), 'utf8');
  const result = await parseStringPromise(xml);
  const story = result.story;
  const title = story.metadata?.[0]?.title?.[0] || name;
  const rawVerses = story.verses?.[0]?.verse || [];
  const verses = rawVerses.map((v) => ({
    chapter: Number(v.$.chapter),
    verse: Number(v.$.verse),
    chapterName: v.chapter_name?.[0] || '',
    bookId: v.book_id?.[0] || '',
    translations: (v.translations?.[0]?.translation || []).map((t) => ({
      author: t.$.author,
      text: t.text[0],
    })),
  }));
  return { name, title, versesCount: verses.length, verses };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of ALLOWED) {
    const data = await convert(name);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`✓ ${name}: ${data.versesCount} verses, ${data.verses.reduce((n, v) => n + v.translations.length, 0)} translations`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add an npm script**

In `package.json`, add to `"scripts"` (after `"loader:generate-quran"`):

```json
    "loader:generate-quran": "node quran_loader/generate-quran-json.js",
    "stories:convert": "node scripts/convert-stories.js"
```

- [ ] **Step 4: Run the conversion**

Run: `npm run stories:convert`
Expected: 13 `✓ <name>: N verses, M translations` lines; no errors.

- [ ] **Step 5: Verify the output**

Run: `ls data/stories/ && node -e "const d=require('./data/stories/khadija.json'); console.log(d.name, d.versesCount, d.verses[0].chapter+':'+d.verses[0].verse, d.verses[0].translations[0].author)"`
Expected: 13 `*.json` files; a line like `khadija <N> <c>:<v> <Author>` with sensible values (chapter/verse numeric, author non-empty).

- [ ] **Step 6: Commit**

```bash
git add scripts/convert-stories.js data/stories package.json
git commit -m "feat(stories): convert story XML to build-only JSON data"
```

---

## Task 2: `lib/story-data.ts` loader

**Files:**
- Create: `lib/story-data.ts`

- [ ] **Step 1: Write the loader**

Create `lib/story-data.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { getVerse } from './quran-data';
import { ALLOWED_STORIES, getStoryMetadata } from './story-config';
import type { Translation } from './quran-utils';

const DATA_DIR = path.join(process.cwd(), 'data', 'stories');
const PAGE_SIZE = 25;
const PREFERRED_TRANSLATORS = ['Saheeh International', 'Yusuf Ali', 'Pickthall', 'Hilali & Khan'];

export interface StoryVerseRaw {
  chapter: number;
  verse: number;
  chapterName: string;
  bookId: string;
  translations: Translation[];
}

interface StoryFile {
  name: string;
  title: string;
  versesCount: number;
  verses: StoryVerseRaw[];
}

export interface StoryPageVerse extends StoryVerseRaw {
  arabic: string | null; // joined from quran-data; null for non-Quran (e.g. hadith) refs
}

export interface StoryPageData {
  name: string;
  title: string;
  description: string;
  page: number;
  pageCount: number;
  totalVerses: number;
  defaultTranslator: string;
  verses: StoryPageVerse[];
}

export interface StorySummary {
  name: string;
  title: string;
  description: string;
  versesCount: number;
  pageCount: number;
}

const cache = new Map<string, StoryFile>();

function load(name: string): StoryFile | null {
  if (!ALLOWED_STORIES.includes(name)) return null;
  const cached = cache.get(name);
  if (cached) return cached;
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf-8'),
    ) as StoryFile;
    cache.set(name, data);
    return data;
  } catch {
    return null;
  }
}

function pageCountOf(verseCount: number): number {
  return Math.max(1, Math.ceil(verseCount / PAGE_SIZE));
}

export function getStoryPageCount(name: string): number {
  const s = load(name);
  return s ? pageCountOf(s.verses.length) : 0;
}

function resolveDefaultTranslator(verses: StoryVerseRaw[]): string {
  const counts = new Map<string, number>();
  for (const v of verses) {
    for (const t of v.translations) counts.set(t.author, (counts.get(t.author) ?? 0) + 1);
  }
  for (const pref of PREFERRED_TRANSLATORS) {
    if (counts.has(pref)) return pref;
  }
  let best = '';
  let bestN = -1;
  for (const [author, n] of counts) {
    if (n > bestN) {
      best = author;
      bestN = n;
    }
  }
  return best;
}

export function getStoryPage(name: string, page: number): StoryPageData | null {
  const s = load(name);
  if (!s) return null;
  const pageCount = pageCountOf(s.verses.length);
  if (!Number.isInteger(page) || page < 1 || page > pageCount) return null;
  const start = (page - 1) * PAGE_SIZE;
  const slice = s.verses.slice(start, start + PAGE_SIZE);
  const verses: StoryPageVerse[] = slice.map((v) => ({
    ...v,
    arabic: getVerse(v.chapter, v.verse)?.arabic ?? null,
  }));
  const meta = getStoryMetadata(name);
  return {
    name,
    title: meta.title,
    description: meta.description,
    page,
    pageCount,
    totalVerses: s.verses.length,
    defaultTranslator: resolveDefaultTranslator(s.verses),
    verses,
  };
}

export function listStories(): StorySummary[] {
  return ALLOWED_STORIES.map((name) => {
    const s = load(name);
    const meta = getStoryMetadata(name);
    const versesCount = s?.verses.length ?? 0;
    return {
      name,
      title: meta.title,
      description: meta.description,
      versesCount,
      pageCount: pageCountOf(versesCount),
    };
  });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Smoke-test the loader at runtime**

Run: `npx tsx -e "import {getStoryPage,getStoryPageCount,listStories} from './lib/story-data'; const p=getStoryPage('adam',1); console.log('pages',getStoryPageCount('adam'),'verses_on_p1',p?.verses.length,'default',p?.defaultTranslator,'arabic0',p?.verses[0].arabic?.slice(0,12)); console.log('summaries',listStories().length);"`
Expected: `pages <>=1`, `verses_on_p1` ≤ 25, a non-empty `default` translator, `arabic0` shows Arabic characters (or `undefined` if verse 1 is non-Quran), `summaries 13`.

> If `tsx` is unavailable, run `npx tsx@latest …`. This step is throwaway verification — nothing to commit from it.

- [ ] **Step 4: Commit**

```bash
git add lib/story-data.ts
git commit -m "feat(stories): add typed story-data loader with Arabic join and pagination"
```

---

## Task 3: `TranslatorSelector` — `defaultSelection` prop

**Files:**
- Modify: `app/components/TranslatorSelector.tsx`

Reason: today the no-localStorage default selects **all** translators ([TranslatorSelector.tsx:38-40](../../../app/components/TranslatorSelector.tsx#L38)). Story pages need the default to be the single story-wide default translator, so the post-hydration state matches the SSR (one translation). The change is backward-compatible — the Quran page passes nothing and keeps selecting all.

- [ ] **Step 1: Add the prop to the interface**

In `app/components/TranslatorSelector.tsx`, change the interface:

```tsx
interface TranslatorSelectorProps {
  availableTranslators: string[];
  onSelectionChange: (selected: string[]) => void;
  defaultSelection?: string[];
}
```

- [ ] **Step 2: Accept the prop**

Change the function signature:

```tsx
export default function TranslatorSelector({ 
  availableTranslators, 
  onSelectionChange,
  defaultSelection,
}: TranslatorSelectorProps) {
```

- [ ] **Step 3: Use it as the no-localStorage fallback**

Replace the default branch in the mount `useEffect` (currently lines 38-40):

```tsx
      // Default: configured default selection, else all translators
      const fallback = (defaultSelection ?? availableTranslators).filter((t) =>
        availableTranslators.includes(t),
      );
      const initial = fallback.length > 0 ? fallback : availableTranslators;
      setSelectedTranslators(initial);
      onSelectionChange(initial);
```

Then add `defaultSelection` to the effect's dependency array:

```tsx
  }, [availableTranslators, onSelectionChange, defaultSelection]);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the Quran `VerseClient` call omits `defaultSelection`, which is valid since it's optional).

- [ ] **Step 5: Commit**

```bash
git add app/components/TranslatorSelector.tsx
git commit -m "feat(stories): let TranslatorSelector accept a default selection"
```

---

## Task 4: `StoryReaderClient` client island

**Files:**
- Create: `app/story/[name]/StoryReaderClient.tsx`

This replaces the verse-rendering half of the old `page.client.tsx`: no virtual scrolling, all verses rendered, `selected` initialized to `[defaultTranslator]`, and `uthmaniText` passed so the Arabic is in the SSR HTML.

- [ ] **Step 1: Write the client island**

Create `app/story/[name]/StoryReaderClient.tsx`:

```tsx
'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import { FiBookOpen } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from '@/app/components/AuthProvider';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import TranslationCarousel from '@/app/components/TranslationCarousel';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider, useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';
import { buildContextUrl, getBookIdForAuthor } from '@/lib/quran-utils';
import type { StoryPageVerse } from '@/lib/story-data';

interface Props {
  name: string;
  verses: StoryPageVerse[];
  defaultTranslator: string;
}

function StoryContent({ name, verses, defaultTranslator }: Props) {
  const { user, loading } = useAuth();
  const dictCtx = useWordDictionaryOptional();
  const isDrawerOpen = dictCtx?.isOpen ?? false;

  // Initialize to the default translator so SSR + first client render show one
  // translation per verse (matches the server output, avoids hydration mismatch).
  const [selected, setSelected] = useState<string[]>([defaultTranslator]);
  const onChange = useCallback((s: string[]) => setSelected(s), []);

  const availableTranslators = React.useMemo(() => {
    const set = new Set<string>();
    verses.forEach((v) => v.translations.forEach((t) => set.add(t.author)));
    return Array.from(set).sort();
  }, [verses]);

  const trackSignIn = (location: string) =>
    MixpanelTracking.track('Click Sign In', { source: 'story_page', story_name: name, location });

  return (
    <div className={`flex dict:flex-row dict:gap-3 ${isDrawerOpen ? 'flex-col fixed inset-0 z-40 bg-[rgb(var(--background-rgb))] dict:relative dict:inset-auto dict:z-auto dict:bg-transparent' : ''}`}>
      <div className={`flex-1 min-w-0 overflow-hidden ${isDrawerOpen ? 'overflow-y-auto p-4 dict:p-0' : ''}`}>
        {!user && !loading && (
          <div className="mb-8 p-6 bg-primary-light bg-opacity-10 rounded-lg text-center">
            <h2 className="text-xl font-semibold text-primary mb-2">Discover More Islamic Knowledge</h2>
            <p className="mb-4">Sign in to search the full collection of Islamic texts and create your own stories.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 py-3 px-6 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
              onClick={() => trackSignIn('top_banner')}
            >
              <FcGoogle className="text-xl" />
              <span>Sign in with Google</span>
            </Link>
          </div>
        )}

        <TranslatorSelector
          availableTranslators={availableTranslators}
          onSelectionChange={onChange}
          defaultSelection={[defaultTranslator]}
        />

        <div className="space-y-2">
          {verses.map((verse) => {
            const matched = verse.translations.filter((t) => selected.includes(t.author));
            const visible = matched.length > 0 ? matched : verse.translations.slice(0, 1);
            const isQuran = !verse.bookId.includes('bukhari');
            return (
              <div key={`${verse.chapter}:${verse.verse}`} className="mb-2">
                {verse.arabic && (
                  <div className="px-4 pt-4 pb-2">
                    <InteractiveArabicText
                      chapter={verse.chapter}
                      verse={verse.verse}
                      uthmaniText={verse.arabic}
                      className="text-gray-800 text-center"
                      useDrawer
                    />
                  </div>
                )}
                <TranslationCarousel
                  translations={visible}
                  verseRef={`${verse.chapter}:${verse.verse}`}
                  chapterName={verse.chapterName}
                  buildTanzilUrl={isQuran ? (author) => `https://tanzil.net/#trans/${getBookIdForAuthor(author)}/${verse.chapter}:${verse.verse}` : undefined}
                  onTanzilClick={isQuran ? (author) => MixpanelTracking.track('Tanzil Link Click', { chapter: verse.chapter, verse: verse.verse, author, source: 'story_page', story_name: name }) : undefined}
                />
                {isQuran && (
                  <div className="flex justify-end px-2">
                    <Link
                      href={buildContextUrl(verse.chapter, verse.verse)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition-colors"
                      onClick={() => MixpanelTracking.track('Read in Context', { chapter: verse.chapter, verse: verse.verse, source: 'story_page', story_name: name })}
                    >
                      <FiBookOpen size={12} />
                      <span>Read section</span>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <WordDrawer className="hidden dict:flex" />
      <WordBottomSheet className="dict:hidden" />
    </div>
  );
}

export default function StoryReaderClient(props: Props) {
  return (
    <WordDictionaryProvider>
      <StoryContent {...props} />
    </WordDictionaryProvider>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/story/[name]/StoryReaderClient.tsx
git commit -m "feat(stories): add StoryReaderClient island (all verses, default translation in SSR)"
```

---

## Task 5: `StoryReader` shared server component

**Files:**
- Create: `app/story/[name]/StoryReader.tsx`

- [ ] **Step 1: Write the server component (with inline pagination nav)**

Create `app/story/[name]/StoryReader.tsx`:

```tsx
import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStoryPage } from '@/lib/story-data';
import StoryReaderClient from './StoryReaderClient';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

function StoryPagination({ name, page, pageCount }: { name: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => (p === 1 ? `/story/${name}` : `/story/${name}/${p}`);
  return (
    <nav className="mt-10 flex items-center justify-between text-sm" aria-label="Story pages">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-primary hover:underline">← Page {page - 1}</Link>
      ) : (
        <span />
      )}
      <span className="text-gray-500">Page {page} of {pageCount}</span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="text-primary hover:underline">Page {page + 1} →</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default function StoryReader({ name, page }: { name: string; page: number }) {
  const data = getStoryPage(name, page);
  if (!data) notFound();

  const base = `${SITE}/story/${name}`;
  const pageUrl = page === 1 ? base : `${base}/${page}`;
  const prevUrl = page === 2 ? base : page > 2 ? `${base}/${page - 1}` : null;
  const nextUrl = page < data.pageCount ? `${base}/${page + 1}` : null;
  const heading = page === 1 ? data.title : `${data.title} — Page ${page} of ${data.pageCount}`;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: heading,
    description: data.description,
    url: pageUrl,
    publisher: { '@type': 'Organization', name: 'Maktabah', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stories', item: `${SITE}/stories` },
      { '@type': 'ListItem', position: 2, name: data.title, item: base },
      ...(page > 1 ? [{ '@type': 'ListItem', position: 3, name: `Page ${page}`, item: pageUrl }] : []),
    ],
  };

  return (
    <div className="py-8">
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/stories" className="hover:underline">Stories</Link> ›{' '}
        <Link href={`/story/${name}`} className="hover:underline">{data.title}</Link>
        {page > 1 && <> › Page {page}</>}
      </nav>

      <h1 className="text-3xl font-bold text-center text-primary mb-2">{data.title}</h1>
      <p className="text-center text-gray-600 mb-6">
        {data.totalVerses} verses{data.pageCount > 1 ? ` · Page ${page} of ${data.pageCount}` : ''}
      </p>

      <StoryReaderClient name={name} verses={data.verses} defaultTranslator={data.defaultTranslator} />

      <StoryPagination name={name} page={page} pageCount={data.pageCount} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/story/[name]/StoryReader.tsx
git commit -m "feat(stories): add shared StoryReader server component"
```

---

## Task 6: Rewrite page-1 route `app/story/[name]/page.tsx`

**Files:**
- Modify (full rewrite): `app/story/[name]/page.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `app/story/[name]/page.tsx` with:

```tsx
import type { Metadata } from 'next';
import { ALLOWED_STORIES } from '@/lib/story-config';
import { getStoryPage } from '@/lib/story-data';
import StoryReader from './StoryReader';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return ALLOWED_STORIES.map((name) => ({ name }));
}

export function generateMetadata({ params }: { params: { name: string } }): Metadata {
  const data = getStoryPage(params.name, 1);
  if (!data) return {};
  const url = `${SITE}/story/${params.name}`;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: { title: data.title, description: data.description, url, type: 'article' },
  };
}

export default function StoryPage({ params }: { params: { name: string } }) {
  return <StoryReader name={params.name} page={1} />;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`page.client.tsx` is still present and now unused — it is deleted in Task 10.)

- [ ] **Step 3: Commit**

```bash
git add app/story/[name]/page.tsx
git commit -m "refactor(stories): page-1 route renders StoryReader"
```

---

## Task 7: Create pages-2+ route `app/story/[name]/[page]/page.tsx`

**Files:**
- Create: `app/story/[name]/[page]/page.tsx`

- [ ] **Step 1: Write the route**

Create `app/story/[name]/[page]/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getStoryPage, listStories } from '@/lib/story-data';
import StoryReader from '../StoryReader';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return listStories().flatMap((s) =>
    Array.from({ length: Math.max(0, s.pageCount - 1) }, (_, i) => ({
      name: s.name,
      page: String(i + 2),
    })),
  );
}

export function generateMetadata({ params }: { params: { name: string; page: string } }): Metadata {
  const page = Number(params.page);
  const data = getStoryPage(params.name, page);
  if (!data) return {};
  const url = `${SITE}/story/${params.name}/${page}`;
  const title = `${data.title} — Page ${page} of ${data.pageCount}`;
  return {
    title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: { title, description: data.description, url, type: 'article' },
  };
}

export default function StoryPagePaginated({ params }: { params: { name: string; page: string } }) {
  return <StoryReader name={params.name} page={Number(params.page)} />;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/story/[name]/[page]/page.tsx"
git commit -m "feat(stories): add paginated pages-2+ route"
```

---

## Task 8: `middleware.ts` — `/story/:name/1` → 308

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Replace the file**

Replace the entire contents of `middleware.ts` with:

```ts
import { NextRequest, NextResponse } from 'next/server';

export const config = { matcher: ['/quran', '/story/:name/1'] };

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /story/<name>/1 → /story/<name> (avoid a duplicate of page 1)
  if (pathname.startsWith('/story/')) {
    const name = pathname.split('/')[2];
    const url = req.nextUrl.clone();
    url.pathname = `/story/${name}`;
    url.search = '';
    return NextResponse.redirect(url, 308);
  }

  // /quran?start=2:255 → /quran/2/255 (legacy range deep-links)
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(stories): redirect /story/:name/1 to /story/:name"
```

---

## Task 9: `sitemap.ts` + `next.config.js`

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `next.config.js`

- [ ] **Step 1: Update the sitemap**

Replace the entire contents of `app/sitemap.ts` with:

```ts
import type { MetadataRoute } from 'next';
import { getMetadata } from '@/lib/quran-data';
import { listStories } from '@/lib/story-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ['', '/quran', '/stories'].map((p) => ({ url: `${SITE}${p}`, lastModified: now }));

  const storyPages = listStories().flatMap((s) => [
    { url: `${SITE}/story/${s.name}`, lastModified: now },
    ...Array.from({ length: Math.max(0, s.pageCount - 1) }, (_, i) => ({
      url: `${SITE}/story/${s.name}/${i + 2}`,
      lastModified: now,
    })),
  ]);

  const surahs = getMetadata().surahs;
  const surahPages = surahs.map((s) => ({ url: `${SITE}/quran/${s.index}`, lastModified: now }));
  const versePages = surahs.flatMap((s) =>
    Array.from({ length: s.verseCount }, (_, i) => ({ url: `${SITE}/quran/${s.index}/${i + 1}`, lastModified: now })),
  );

  return [...staticPages, ...storyPages, ...surahPages, ...versePages];
}
```

- [ ] **Step 2: Add cacheable headers + file-tracing for stories**

In `next.config.js`, add `./data/stories/**/*` to the sitemap tracing include and add story header rules.

Change the `outputFileTracingIncludes` block to:

```js
    outputFileTracingIncludes: {
      '/quran/[surah]': ['./data/quran/**/*'],
      '/quran/[surah]/[verse]': ['./data/quran/**/*'],
      '/sitemap.xml': ['./data/quran/**/*', './data/stories/**/*'],
    },
```

Change the `headers()` return array to:

```js
  async headers() {
    return [
      {
        source: '/quran/:surah/:verse',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/story/:name',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/story/:name/:page',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=31536000, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts next.config.js
git commit -m "feat(stories): add stories to sitemap; cacheable headers + tracing"
```

---

## Task 10: Cleanup — delete old client, public XML, move `xml2js`

**Files:**
- Delete: `app/story/[name]/page.client.tsx`
- Delete: `public/stories/`
- Modify: `package.json` (move `xml2js` from `dependencies` to `devDependencies`)

- [ ] **Step 1: Confirm nothing imports the old client or public XML at runtime**

Run: `grep -rn "page.client" app/story || echo "no refs"; grep -rn "public/stories\|stories/\${" app lib --include=*.ts --include=*.tsx | grep -v node_modules || echo "no runtime refs"`
Expected: `no refs` for the old client import; no runtime code references `public/stories` (only `scripts/convert-stories.js` does, which is fine).

- [ ] **Step 2: Delete the old client component and public XML**

Run: `git rm app/story/[name]/page.client.tsx && git rm -r public/stories`
Expected: files staged for deletion.

- [ ] **Step 3: Move `xml2js` to devDependencies**

In `package.json`, remove `"xml2js": "^0.6.2"` from `"dependencies"` and add it to `"devDependencies"` (it is only used by `scripts/convert-stories.js`). `@types/xml2js` is already in `devDependencies` — leave it.

Run: `npm install` (re-resolves the lockfile after the move)
Expected: completes without errors.

- [ ] **Step 4: Verify `xml2js` is not imported by app/runtime code**

Run: `grep -rn "xml2js" app lib --include=*.ts --include=*.tsx | grep -v node_modules || echo "clean"`
Expected: `clean` (only `scripts/convert-stories.js` imports it).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(stories): remove old client + public XML; move xml2js to devDeps"
```

---

## Task 11: Full build + runtime verification

**Files:** none (verification only)

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: build succeeds. In the route summary, `/story/[name]` and `/story/[name]/[page]` are listed as static (prebuilt, `●`/`○`), NOT `ƒ` (dynamic). Note the total number of story pages generated (13 stories' page-1 + all page-2+).

- [ ] **Step 2: Start the production server**

Run: `npm run start` (in a background shell; serves on `http://localhost:3000`)
Expected: "Ready" log line.

- [ ] **Step 3: Verify page-1 content is in the HTML (not just hydration)**

Run: `curl -s http://localhost:3000/story/adam | grep -o 'arabic-text' | head -1; curl -s http://localhost:3000/story/adam | grep -ci 'translation\|carousel-card'`
Expected: `arabic-text` is found (Arabic rendered server-side); the translation/card grep count is > 0 (a default translation is in the HTML).

- [ ] **Step 4: Verify canonical + pagination metadata**

Run: `curl -s http://localhost:3000/story/adam | grep -Eo '<link rel="(canonical|next)"[^>]*>'`
Expected: a self-canonical to `…/story/adam`, and a `rel="next"` to `…/story/adam/2` (Adam spans multiple pages). If `rel="next"` does NOT appear in the output, see Step 4a.

- [ ] **Step 4a: (Only if Step 4 lacks rel=next) confirm placement / accept fallback**

Run: `curl -s http://localhost:3000/story/adam | tr '>' '>\n' | grep -n 'rel="next"'`
Expected: the tag exists somewhere in the document. On Next 14 / React 18.2, component-rendered `<link>` tags may land in `<body>` rather than `<head>`. Self-canonical (emitted via the Metadata API, always in `<head>`) is the load-bearing SEO signal and is unaffected; `rel=prev/next` is a low-stakes secondary signal (Google deprecated it in 2019). If the tag is present anywhere, accept it and proceed. If it is entirely absent, file a follow-up note in the PR — do not block.

- [ ] **Step 5: Verify pages-2+ and 404/redirect behavior**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/story/adam/2
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/story/adam/999
curl -s -o /dev/null -w "%{redirect_url} %{http_code}\n" http://localhost:3000/story/adam/1
curl -s http://localhost:3000/story/adam/2 | grep -Eo '<link rel="canonical"[^>]*>'
```
Expected: `/story/adam/2` → `200`; `/story/adam/999` → `404`; `/story/adam/1` → `…/story/adam 308`; the page-2 canonical points to `…/story/adam/2` (self).

- [ ] **Step 6: Verify the sitemap**

Run: `curl -s http://localhost:3000/sitemap.xml | grep -Eo '/(stories|story/adam(/[0-9]+)?)<' | sort -u | head`
Expected: contains `/stories<`, `/story/adam<`, and at least one `/story/adam/2<`.

- [ ] **Step 7: Verify word-drawer data path (manual, in a browser)**

Open `http://localhost:3000/story/adam`, click an Arabic word.
Expected: a network request to `/api/storage/quran/words/<chapter>.json` returns 200 and the word drawer (desktop) / bottom sheet (mobile) opens with morphology. (If word data isn't uploaded in the local env, the Arabic still reads — the click is a no-op fallback; note this rather than treat it as a failure.)

- [ ] **Step 8: Stop the server**

Stop the background `npm run start` process.

- [ ] **Step 9: Final verification commit (if any incidental fixes were made)**

If Steps 1-8 required code fixes, commit them:

```bash
git add -A
git commit -m "fix(stories): address verification findings"
```

If no fixes were needed, there is nothing to commit — proceed to the PR.

---

## Spec coverage check

- SEO: real Arabic + a translation in SSR HTML → Tasks 4-6, verified Task 11 Step 3. ✓
- Paginated, ~25/page, page-1 at `/story/[name]`, pages 2+ at `/story/[name]/[page]` → Tasks 6-7; `PAGE_SIZE = 25` Task 2. ✓
- Self-canonical + rel prev/next, unique titles → Tasks 5-7, verified Task 11 Steps 4-5. ✓
- Arabic joined from `quran-data`; hadith translation-only → Task 2 (`getVerse` join), Task 4 (`verse.arabic &&` gate). ✓
- XML→JSON in `data/stories/`, `xml2js` out of runtime → Tasks 1, 10. ✓
- Fully static → `dynamicParams = false` + `generateStaticParams` Tasks 6-7, verified Task 11 Step 1. ✓
- Caching: user-agnostic SSR (deterministic default translator, client-only auth/selector) → Task 4; cacheable headers → Task 9; verified Task 11. ✓
- Sitemap adds `/stories` + story pages → Task 9, verified Task 11 Step 6. ✓
- `/story/:name/1` → 308 → Task 8, verified Task 11 Step 5. ✓
- Default translator: preferred-list → most-frequent → per-verse first-available fallback → Task 2 (`resolveDefaultTranslator`) + Task 4 (`visible` fallback). ✓
- Cleanup: delete `public/stories/`, old `page.client.tsx` → Task 10. ✓
