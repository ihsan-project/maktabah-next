'use client';

import React, { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import SearchForm from '@/app/components/SearchForm';
import SearchResults from '@/app/components/SearchResults';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import BookFilter from '@/app/components/BookFilter';
import SearchModeToggle, { SearchMode } from '@/app/components/SearchModeToggle';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';

const DEFAULT_BOOKS = ['quran', 'bukhari'];

export default function SearchPage(): JSX.Element {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read state from URL
  const query = searchParams.get('q') || '';
  const rawPage = searchParams.get('page');
  const parsedPage = rawPage !== null ? Number.parseInt(rawPage, 10) : 1;
  const page = Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1);
  const titles = searchParams.getAll('title[]');
  const selectedBooks = titles.length > 0 ? titles : DEFAULT_BOOKS;

  // Local state for data that doesn't belong in URL
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);

  const isDevelopment = process.env.NODE_ENV === 'development';
  const [searchMode, setSearchMode] = useState<SearchMode>('hybrid');

  // Track the last fetched params to avoid duplicate fetches
  const lastFetchRef = useRef<string>('');
  // AbortController to cancel in-flight requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Build URL search params string
  const buildSearchParams = useCallback((overrides: {
    q?: string;
    page?: number;
    titles?: string[];
  } = {}) => {
    const params = new URLSearchParams();
    const newQ = overrides.q ?? query;
    const newPage = overrides.page ?? page;
    const newTitles = overrides.titles ?? selectedBooks;

    if (newQ) params.set('q', newQ);
    if (newPage > 1) params.set('page', String(newPage));
    newTitles.forEach(t => params.append('title[]', t));

    return params.toString();
  }, [query, page, selectedBooks]);

  // Get the appropriate API URL based on environment
  const getApiUrl = useCallback((q: string, p: number, bookFilters: string[]): string => {
    const baseUrl = isDevelopment
      ? 'http://127.0.0.1:5001/maktabah-8ac04/us-central1/nextApiHandler/api/search'
      : `/api/search`;

    let url = `${baseUrl}?q=${encodeURIComponent(q)}&page=${p}&size=10`;
    if (isDevelopment) {
      url += `&mode=${searchMode}&debug=true`;
    }

    bookFilters.forEach(book => {
      url += `&title[]=${encodeURIComponent(book)}`;
    });

    return url;
  }, [isDevelopment, searchMode]);

  // Perform search — always replaces results (no appending)
  const performSearch = useCallback(async (q: string, p: number, books: string[]) => {
    if (!q) return;

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const apiUrl = getApiUrl(q, p, books);
      console.log('Searching using API URL:', apiUrl);

      const response = await fetch(apiUrl, { signal: controller.signal });
      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();

      setTotalResults(data.total);
      setTotalPages(data.totalPages);
      setResults(data.results);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      console.error('Search error:', error);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [getApiUrl]);

  // React to URL changes — trigger search
  useEffect(() => {
    if (!query) {
      setResults([]);
      setTotalResults(0);
      setTotalPages(0);
      lastFetchRef.current = '';
      return;
    }

    const sortedBooks = [...selectedBooks].sort();
    const fetchKey = `${query}|${page}|${searchMode}|${sortedBooks.join(',')}`;
    if (fetchKey === lastFetchRef.current) return;
    lastFetchRef.current = fetchKey;

    performSearch(query, page, sortedBooks);
  }, [query, page, selectedBooks, searchMode, performSearch]);

  // New search — push to history
  const handleSearch = useCallback((newQuery: string) => {
    if (!newQuery.trim()) return;

    MixpanelTracking.track('Search', {
      query: newQuery,
      page: 1,
      bookFilters: selectedBooks,
      searchMode: searchMode,
    });

    const params = buildSearchParams({ q: newQuery.trim(), page: 1 });
    router.push(`/search?${params}`);
  }, [selectedBooks, searchMode, buildSearchParams, router]);

  // Filter change — replace (refinement, resets to page 1)
  const handleBookFilterChange = useCallback((newBooks: string[]) => {
    const params = buildSearchParams({ titles: newBooks, page: 1 });
    lastFetchRef.current = '';
    router.replace(`/search?${params}`);
  }, [buildSearchParams, router]);

  // Page change — push to history (so back/forward navigates pages)
  const handlePageChange = useCallback((newPage: number) => {
    MixpanelTracking.track('Page Change', {
      query: query,
      page: newPage,
    });

    const params = buildSearchParams({ page: newPage });
    router.push(`/search?${params}`);
  }, [query, buildSearchParams, router]);

  const quickSearches = [
    { label: 'Mercy', query: 'mercy' },
    { label: 'Patience', query: 'patience' },
    { label: 'Prayer', query: 'prayer' },
    { label: 'Forgiveness', query: 'forgiveness' },
    { label: 'Righteousness', query: 'righteousness' },
    { label: 'Gratitude', query: 'gratitude' },
  ];

  // Hero centerstage — no query yet
  if (!query) {
    return (
      <ProtectedRoute>
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] px-4">
          {/* Hero heading */}
          <div className="text-center mb-8">
            <h1 className="text-4xl md:text-5xl font-bold text-primary mb-3">Maktabah</h1>
            <p className="text-lg md:text-xl text-gray-600">Search the Quran and Hadith collections</p>
          </div>

          {/* Large search bar */}
          <div className="w-full max-w-3xl">
            <SearchForm onSearch={handleSearch} initialQuery={query} size="large" />
          </div>

          {/* Book filter */}
          <div className="flex items-center gap-2 mt-6">
            <BookFilter
              selectedBooks={selectedBooks}
              onChange={handleBookFilterChange}
            />
            {isDevelopment && (
              <SearchModeToggle
                mode={searchMode}
                onChange={setSearchMode}
              />
            )}
          </div>

          {/* Quick search suggestions */}
          <div className="mt-10 text-center max-w-2xl">
            <p className="text-sm text-gray-500 mb-3">Try searching for</p>
            <div className="flex flex-wrap justify-center gap-2">
              {quickSearches.map(({ label, query: q }) => (
                <button
                  key={q}
                  onClick={() => handleSearch(q)}
                  className="px-4 py-2 text-sm rounded-full border border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors duration-200"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Results layout — active query
  return (
    <ProtectedRoute>
      <div className="pb-8">
        {/* Sticky Search Form Container */}
        <div className="sticky top-0 z-10 bg-secondary py-4 shadow-md">
          <div className="container mx-auto px-4">
            <div className="flex flex-wrap md:flex-nowrap gap-4 items-center">
              <div className="order-1 md:order-none w-full md:w-auto flex gap-2 items-center">
                <BookFilter
                  selectedBooks={selectedBooks}
                  onChange={handleBookFilterChange}
                />
                {isDevelopment && (
                  <SearchModeToggle
                    mode={searchMode}
                    onChange={setSearchMode}
                  />
                )}
              </div>
              <div className="w-full">
                <SearchForm onSearch={handleSearch} initialQuery={query} />
              </div>
            </div>
          </div>
        </div>

        {/* Results section with search info */}
        <div className="mt-4 container mx-auto px-4">
          <div className="mb-4">
            <p className="text-gray-600">
              {totalResults > 0 ? (
                <>Found {totalResults} results for &quot;{query}&quot;</>
              ) : loading ? (
                <>Searching for &quot;{query}&quot;...</>
              ) : (
                <>No results found for &quot;{query}&quot;</>
              )}
            </p>
          </div>
          <SearchResults
            results={results}
            loading={loading}
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
