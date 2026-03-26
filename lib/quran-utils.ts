/**
 * Utilities for the Quran reader: range parsing, data fetching, types.
 */

export interface Translation {
  author: string;
  text: string;
}

export interface SurahData {
  index: number;
  name: string;
  verseCount: number;
  verses: Record<string, Translation[]>;
}

export interface SurahMeta {
  index: number;
  name: string;
  verseCount: number;
}

export interface QuranMetadata {
  translators: string[];
  surahCount: number;
  surahs: SurahMeta[];
}

export interface VerseRef {
  surah: number;
  verse: number;
}

export interface QuranVerse {
  surah: number;
  verse: number;
  surahName: string;
  translations: Translation[];
}

/**
 * Parse a verse reference string like "2:255" into { surah, verse }.
 */
export function parseVerseRef(ref: string): VerseRef | null {
  const parts = ref.split(':');
  if (parts.length !== 2) return null;
  const surah = parseInt(parts[0], 10);
  const verse = parseInt(parts[1], 10);
  if (isNaN(surah) || isNaN(verse) || surah < 1 || surah > 114 || verse < 1) return null;
  return { surah, verse };
}

/**
 * Fetch a single surah's JSON data from /quran/{index}.json.
 */
export async function fetchSurahData(surahIndex: number): Promise<SurahData> {
  const res = await fetch(`${getBasePath()}/quran/${surahIndex}.json`);
  if (!res.ok) throw new Error(`Failed to fetch surah ${surahIndex}`);
  return res.json();
}

/**
 * Fetch the Quran metadata (surah list, translators).
 */
export async function fetchQuranMetadata(): Promise<QuranMetadata> {
  const res = await fetch(`${getBasePath()}/quran/metadata.json`);
  if (!res.ok) throw new Error('Failed to fetch Quran metadata');
  return res.json();
}

/**
 * Get the base path for static assets. Handles both dev and production.
 */
function getBasePath(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return '';
}

/**
 * Default range: Al-Fatiha (1:1-1:7).
 */
export const DEFAULT_START: VerseRef = { surah: 1, verse: 1 };
export const DEFAULT_END: VerseRef = { surah: 1, verse: 7 };
