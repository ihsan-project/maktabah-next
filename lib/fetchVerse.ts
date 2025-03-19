/**
 * Utility to fetch verses from Firebase Storage
 */

import { getStorage, ref, getDownloadURL } from "firebase/storage";
import { firebaseApp } from '@/firebaseConfig';

// Initialize Firebase Storage
const storage = getStorage(firebaseApp);

/**
 * Fetch a specific verse from Firebase Storage
 * 
 * @param bookId The book identifier
 * @param chapter The chapter number
 * @param verse The verse number
 * @returns Promise with the verse data
 */
export async function fetchVerse(bookId: string, chapter: number, verse: number) {
  try {
    // Create a reference to the verse JSON file
    const versePath = `${bookId}/${chapter}/${verse}.json`;
    const verseRef = ref(storage, versePath);
    
    // Get download URL for the file
    const url = await getDownloadURL(verseRef);
    
    // Fetch the JSON data
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching verse: ${response.statusText}`);
    }
    
    // Parse and return the verse data
    return await response.json();
  } catch (error) {
    console.error('Error fetching verse:', error);
    throw error;
  }
}

/**
 * Fetch all verses in a chapter from Firebase Storage
 * 
 * @param bookId The book identifier
 * @param chapter The chapter number
 * @returns Promise with array of verses
 */
export async function fetchChapter(bookId: string, chapter: number) {
  try {
    // Create a reference to the chapter JSON file
    const chapterPath = `${bookId}/${chapter}/chapter.json`;
    const chapterRef = ref(storage, chapterPath);
    
    // Get download URL for the file
    const url = await getDownloadURL(chapterRef);
    
    // Fetch the JSON data
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching chapter: ${response.statusText}`);
    }
    
    // Parse and return the verse data
    return await response.json();
  } catch (error) {
    console.error('Error fetching chapter:', error);
    throw error;
  }
}

/**
 * Fetch book metadata from Firebase Storage
 * 
 * @param bookId The book identifier
 * @returns Promise with book metadata
 */
export async function fetchBookMetadata(bookId: string) {
  try {
    // Create a reference to the book JSON file
    const bookPath = `${bookId}/book.json`;
    const bookRef = ref(storage, bookPath);
    
    // Get download URL for the file
    const url = await getDownloadURL(bookRef);
    
    // Fetch the JSON data
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Error fetching book metadata: ${response.statusText}`);
    }
    
    // Parse and return the book data
    return await response.json();
  } catch (error) {
    console.error('Error fetching book metadata:', error);
    throw error;
  }
}
