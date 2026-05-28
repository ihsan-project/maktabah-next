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
