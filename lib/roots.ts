/**
 * Utility to load and cache the Quran roots index for cross-reference lookups.
 */

export interface RootOccurrence {
  s: number; // surah
  v: number; // verse
  p: number; // word position
}

interface RootEntry {
  occurrences: number;
  verses: RootOccurrence[];
}

type RootsIndex = Record<string, RootEntry>;

let rootsData: RootsIndex | null = null;
let loadingPromise: Promise<RootsIndex | null> | null = null;

/**
 * Load and cache the roots index. Returns null if loading fails.
 * Only fetches once — subsequent calls return the cached data.
 */
export async function loadRootsIndex(): Promise<RootsIndex | null> {
  if (rootsData) return rootsData;
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch('/quran/words/roots.json')
    .then((res) => {
      if (!res.ok) return null;
      return res.json() as Promise<RootsIndex>;
    })
    .then((data) => {
      if (data) {
        rootsData = data;
      }
      return data;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

/**
 * Get all occurrences for a given root string (e.g., "ر ح م").
 */
export async function getRootOccurrences(
  root: string,
): Promise<RootOccurrence[]> {
  const index = await loadRootsIndex();
  return index?.[root]?.verses ?? [];
}

/**
 * Get the total occurrence count for a root.
 */
export async function getRootCount(root: string): Promise<number> {
  const index = await loadRootsIndex();
  return index?.[root]?.occurrences ?? 0;
}
