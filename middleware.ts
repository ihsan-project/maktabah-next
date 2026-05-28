import { NextRequest, NextResponse } from 'next/server';

export const config = { matcher: ['/quran'] };

export function middleware(req: NextRequest) {
  const start = req.nextUrl.searchParams.get('start'); // e.g. "2:255"
  if (!start) return NextResponse.next();
  const [s, v] = start.split(':');
  const surah = Number(s);
  const verse = Number(v);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/quran/${surah}/${verse}`;
  const highlight = req.nextUrl.searchParams.get('highlight');
  url.search = highlight ? `?highlight=${encodeURIComponent(highlight)}` : '';
  return NextResponse.redirect(url, 308);
}
