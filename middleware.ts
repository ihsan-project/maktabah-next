import { NextRequest, NextResponse } from 'next/server';

export const config = { matcher: ['/quran', '/story/:name/1'] };

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /story/<name>/1 → /story/<name> (avoid a duplicate of page 1)
  if (pathname.startsWith('/story/')) {
    const name = pathname.split('/')[2];
    const url = req.nextUrl.clone();
    url.pathname = `/story/${name}`;
    url.search = '';
    return NextResponse.redirect(url, 308);
  }

  // /quran?start=2:255 → /quran/2/255 (legacy range deep-links)
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
