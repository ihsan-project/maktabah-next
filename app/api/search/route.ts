import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/server/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const query = searchParams.get('q');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  // Cap size at 100 to match the OpenSearch fetch limit in semantic/hybrid modes.
  const size = Math.min(100, Math.max(1, parseInt(searchParams.get('size') || '10', 10) || 10));
  const author = searchParams.get('author');
  const chapter = searchParams.get('chapter');
  const titles = searchParams.getAll('title');
  const mode = (searchParams.get('mode') || 'hybrid') as 'text' | 'semantic' | 'hybrid';
  const debug = searchParams.get('debug') === 'true';

  if (!query) {
    return NextResponse.json({ error: 'Missing search query parameter (q)' }, { status: 400 });
  }
  if (!['text', 'semantic', 'hybrid'].includes(mode)) {
    return NextResponse.json(
      { error: 'Invalid mode. Use "text", "semantic", or "hybrid".' },
      { status: 400 }
    );
  }

  try {
    const searchResults = await searchDocuments(query, {
      page,
      size,
      author,
      chapter,
      titles: titles.length ? titles : null,
      mode,
    });

    if (!debug) {
      searchResults.results = searchResults.results.map(({ source, ...rest }: any) => rest);
    }

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
