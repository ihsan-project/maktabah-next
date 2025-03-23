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
    // Determine if in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Create the API path portion
    const apiPath = `storage/${bookId}/${chapter}/${verse}.json`;
    
    // Use emulator URL in development, relative path in production
    const versePath = isDevelopment
      ? `http://127.0.0.1:5001/maktabah-8ac04/us-central1/proxyStorage/${apiPath}`
      : `/${apiPath}`;
    
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
    // Determine if in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Create the API path portion
    const apiPath = `storage/${bookId}/${chapter}/chapter.json`;
    
    // Use emulator URL in development, relative path in production
    const chapterPath = isDevelopment
      ? `http://127.0.0.1:5001/maktabah-8ac04/us-central1/proxyStorage/${apiPath}`
      : `/${apiPath}`;
    
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
    // Determine if in development environment
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Create the API path portion
    const apiPath = `storage/${bookId}/book.json`;
    
    // Use emulator URL in development, relative path in production
    const bookPath = isDevelopment
      ? `http://127.0.0.1:5001/maktabah-8ac04/us-central1/proxyStorage/${apiPath}`
      : `/${apiPath}`;
    
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
