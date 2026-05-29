import fs from 'fs';
import path from 'path';
import { getVerse } from './quran-data';
import { ALLOWED_STORIES, getStoryMetadata } from './story-config';
import { isQuranBookId } from './quran-utils';
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
const translatorCache = new Map<string, string>();

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
  } catch (err) {
    console.error(`[story-data] failed to load ${name}.json:`, err);
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
  counts.forEach((n, author) => {
    if (n > bestN) {
      best = author;
      bestN = n;
    }
  });
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
    arabic: isQuranBookId(v.bookId) ? (getVerse(v.chapter, v.verse)?.arabic ?? null) : null,
  }));
  const meta = getStoryMetadata(name);
  let defaultTranslator = translatorCache.get(name);
  if (defaultTranslator === undefined) {
    defaultTranslator = resolveDefaultTranslator(s.verses);
    translatorCache.set(name, defaultTranslator);
  }
  return {
    name,
    title: meta.title,
    description: meta.description,
    page,
    pageCount,
    totalVerses: s.verses.length,
    defaultTranslator,
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
