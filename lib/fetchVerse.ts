/**
 * Utility to fetch verses from Firebase Storage via the /api/storage proxy route.
 */
import { appCheckFetch } from '@/lib/appCheckFetch';

async function fetchStorageJson(apiPath: string) {
  const response = await appCheckFetch(`/${apiPath}`);
  if (!response.ok) {
    throw new Error(`Error fetching ${apiPath}: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchVerse(bookId: string, chapter: number, verse: number) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/${chapter}/${verse}.json`);
  } catch (error) {
    console.error('Error fetching verse:', error);
    throw error;
  }
}

export async function fetchChapter(bookId: string, chapter: number) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/${chapter}/chapter.json`);
  } catch (error) {
    console.error('Error fetching chapter:', error);
    throw error;
  }
}

export async function fetchBookMetadata(bookId: string) {
  try {
    return await fetchStorageJson(`api/storage/${bookId}/book.json`);
  } catch (error) {
    console.error('Error fetching book metadata:', error);
    throw error;
  }
}
