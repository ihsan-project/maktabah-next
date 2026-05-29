/**
 * Utilities for the Quran reader: range parsing, data fetching, types.
 */

export interface Translation {
  author: string;
  text: string;
}

export interface VerseData {
  arabic: string;
  translations: Translation[];
}

export interface SurahData {
  index: number;
  name: string;
  verseCount: number;
  verses: Record<string, VerseData>;
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
  arabic: string;
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

const AUTHOR_TO_BOOK_ID: Record<string, string> = {
  'Ahmed Ali': 'en.ahmedali',
  'Ahmed Raza Khan': 'en.ahmedraza',
  'Arberry': 'en.arberry',
  'Daryabadi': 'en.daryabadi',
  'Hilali & Khan': 'en.hilali',
  'Itani': 'en.itani',
  'Maududi': 'en.maududi',
  'Mubarakpuri': 'en.mubarakpuri',
  'Pickthall': 'en.pickthall',
  'Qarai': 'en.qarai',
  'Qaribullah & Darwish': 'en.qaribullah',
  'Saheeh International': 'en.sahih',
  'Sarwar': 'en.sarwar',
  'Shakir': 'en.shakir',
  'Wahiduddin Khan': 'en.wahiduddin',
  'Yusuf Ali': 'en.yusufali',
};

export function getBookIdForAuthor(author: string): string {
  return AUTHOR_TO_BOOK_ID[author] || 'en.sahih';
}

/**
 * Build a /quran verse URL, with an optional highlight term (applied client-side).
 */
export function buildContextUrl(chapter: number, verse: number, query?: string): string {
  const base = `/quran/${chapter}/${verse}`;
  return query ? `${base}?highlight=${encodeURIComponent(query)}` : base;
}

const HADITH_BOOK_MARKERS = ['bukhari'];

/**
 * Whether a story verse's bookId refers to a Quran translation (vs a Hadith
 * collection). Case-insensitive. Used to decide Arabic joins and Quran-only links.
 */
export function isQuranBookId(bookId: string): boolean {
  const id = bookId.toLowerCase();
  return !HADITH_BOOK_MARKERS.some((m) => id.includes(m));
}
