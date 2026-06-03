export class BadRequestError extends Error {
  statusCode: 400 = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export type SearchMode = 'text' | 'semantic' | 'hybrid';

export interface SearchParams {
  q: string;             // 1..200 chars
  page: number;          // 1..50
  size: number;          // 1..25
  mode: SearchMode;
  author: string | null;
  chapter: string | null;
  titles: string[];      // possibly empty
  debug: boolean;
}

const MAX_QUERY_LEN = 200;
const MAX_PAGE_SIZE = 25;
const MAX_PAGE = 50;
const VALID_MODES: readonly SearchMode[] = ['text', 'semantic', 'hybrid'];
const SEMANTIC_HYBRID_MAX_OFFSET = 100;

/**
 * Parse a bounded positive integer query param.
 * Returns `fallback` only when the param is omitted.
 * Throws BadRequestError(400) when the param is present but out of range or non-numeric.
 */
function parseBoundedInt(raw: string | null, paramName: string, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n < 1 || n > max) {
    throw new BadRequestError(`${paramName}: must be 1..${max}`);
  }
  return n;
}

/**
 * Parse and validate /api/search query string parameters.
 * Throws BadRequestError(400, '<param>: <reason>') on the first violation.
 */
export function parseSearchParams(searchParams: URLSearchParams): SearchParams {
  const q = (searchParams.get('q') || '').trim();
  if (!q) {
    throw new BadRequestError('q: required');
  }
  if (q.length > MAX_QUERY_LEN) {
    throw new BadRequestError(`q: must be ≤ ${MAX_QUERY_LEN} characters`);
  }

  const size = parseBoundedInt(searchParams.get('size'), 'size', MAX_PAGE_SIZE, 10);
  const page = parseBoundedInt(searchParams.get('page'), 'page', MAX_PAGE, 1);

  const modeRaw = searchParams.get('mode') || 'hybrid';
  if (!VALID_MODES.includes(modeRaw as SearchMode)) {
    throw new BadRequestError(`mode: must be one of ${VALID_MODES.join(', ')}`);
  }
  const mode = modeRaw as SearchMode;

  if (mode !== 'text' && (page - 1) * size >= SEMANTIC_HYBRID_MAX_OFFSET) {
    const maxPage = Math.max(1, Math.floor((SEMANTIC_HYBRID_MAX_OFFSET - 1) / size) + 1);
    throw new BadRequestError(
      `page: in ${mode} mode, max page is ${maxPage} for size=${size} (semantic/hybrid fetch is capped at ${SEMANTIC_HYBRID_MAX_OFFSET} results)`
    );
  }

  return {
    q,
    page,
    size,
    mode,
    author: searchParams.get('author'),
    chapter: searchParams.get('chapter'),
    titles: searchParams.getAll('title'),
    debug: searchParams.get('debug') === 'true',
  };
}
