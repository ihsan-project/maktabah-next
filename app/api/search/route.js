import { NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/elasticsearch';

export async function GET(request) {
  try {
    // Get query parameters
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const size = parseInt(searchParams.get('size') || '10', 10);

    // Validate the query
    if (!query) {
      return NextResponse.json(
        { error: 'Missing search query parameter (q)' },
        { status: 400 }
      );
    }

    // Search documents
    const searchResults = await searchDocuments(query, page, size);

    // Return search results
    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('Search API error:', error);
    
    return NextResponse.json(
      { error: 'Failed to perform search' },
      { status: 500 }
    );
  }
}
