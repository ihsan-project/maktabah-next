/**
 * Utility to fetch verses from Firebase Storage via proxy function
 * This approach avoids CORS issues by accessing files through your own domain
 */

/**
 * Fetch a specific verse using the Firebase function proxy
 * 
 * @param bookId The book identifier
 * @param chapter The chapter number
 * @param verse The verse number
 * @returns Promise with the verse data
 */
export async function fetchVerse(bookId: string, chapter: number, verse: number) {
  try {
    // Create the path for the verse JSON file through the proxy
    const versePath = `/storage/${bookId}/${chapter}/${verse}.json`;
    
    // Fetch the JSON data
    const response = await fetch(versePath);
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
 * Fetch all verses in a chapter using the Firebase function proxy
 * 
 * @param bookId The book identifier
 * @param chapter The chapter number
 * @returns Promise with array of verses
 */
export async function fetchChapter(bookId: string, chapter: number) {
  try {
    // Create the path for the chapter JSON file through the proxy
    const chapterPath = `/storage/${bookId}/${chapter}/chapter.json`;
    
    // Fetch the JSON data
    const response = await fetch(chapterPath);
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
 * Fetch book metadata using the Firebase function proxy
 * 
 * @param bookId The book identifier
 * @returns Promise with book metadata
 */
export async function fetchBookMetadata(bookId: string) {
  try {
    // Create the path for the book JSON file through the proxy
    const bookPath = `/storage/${bookId}/book.json`;
    
    // Fetch the JSON data
    const response = await fetch(bookPath);
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
