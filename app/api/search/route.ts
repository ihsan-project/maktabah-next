import { NextRequest, NextResponse } from 'next/server';
import { searchDocuments } from '@/lib/server/search';
import { requireAppCheck, AppCheckError } from '@/lib/server/app-check';
import { requireRateLimit, RateLimitError } from '@/lib/server/rate-limit';
import { parseSearchParams, BadRequestError } from '@/lib/server/search-params';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let params;
  try {
    await requireAppCheck(req);
    await requireRateLimit(req, { bucket: 'search', limit: 30, windowMs: 60_000 });
    params = parseSearchParams(req.nextUrl.searchParams);
  } catch (err) {
    if (err instanceof AppCheckError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, {
        status: err.statusCode,
        headers: { 'Retry-After': String(err.retryAfterSec) },
      });
    }
    if (err instanceof BadRequestError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const searchResults = await searchDocuments(params.q, {
      page: params.page,
      size: params.size,
      author: params.author,
      chapter: params.chapter,
      titles: params.titles.length ? params.titles : null,
      mode: params.mode,
    });

    if (!params.debug) {
      searchResults.results = searchResults.results.map(({ source, ...rest }: any) => rest);
    }

    return NextResponse.json(searchResults);
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
