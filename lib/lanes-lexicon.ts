/**
 * Utility to lazy-load and cache Lane's Lexicon data, split by first letter of root.
 * Each letter file is loaded on demand and cached in memory.
 */

export interface LaneMorphForm {
  pattern: string;
  arabic: string;
  name: string;
  category: string;
  example: string;
  occurrences: number;
}

export interface LanesEntry {
  root_ar: string;
  summary: string | null;
  definition: string | null;
  preview: string | null;
  source: 'lane' | 'corpus_only';
  frequency: number;
  morphological_forms: LaneMorphForm[];
}

type LetterData = Record<string, LanesEntry>;

const letterCache = new Map<string, LetterData>();
const loadingPromises = new Map<string, Promise<LetterData | null>>();

/**
 * Load the Lane's Lexicon data for a given first letter.
 */
async function loadLetterFile(letter: string): Promise<LetterData | null> {
  if (letterCache.has(letter)) return letterCache.get(letter)!;
  if (loadingPromises.has(letter)) return loadingPromises.get(letter)!;

  const promise = fetch(`/quran/words/lanes/${letter}.json`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<LetterData>;
    })
    .then((data) => {
      if (data) letterCache.set(letter, data);
      loadingPromises.delete(letter);
      return data;
    })
    .catch(() => {
      loadingPromises.delete(letter);
      return null;
    });

  loadingPromises.set(letter, promise);
  return promise;
}

/**
 * Look up a Lane's Lexicon entry by spaced root (e.g., "ر ح م").
 * Loads the appropriate letter file on demand.
 */
export async function getLanesEntry(
  spacedRoot: string,
): Promise<LanesEntry | null> {
  if (!spacedRoot) return null;
  const firstLetter = spacedRoot.split(' ')[0];
  if (!firstLetter) return null;

  const data = await loadLetterFile(firstLetter);
  return data?.[spacedRoot] ?? null;
}
