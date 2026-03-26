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
  const page = parseInt(searchParams.get('page') || '1', 10);
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

    setLoading(true);
    try {
      const apiUrl = getApiUrl(q, p, books);
      console.log('Searching using API URL:', apiUrl);

      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Search request failed');
      }

      const data = await response.json();

      setTotalResults(data.total);
      setTotalPages(data.totalPages);
      setResults(data.results);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
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

    const fetchKey = `${query}|${page}|${selectedBooks.sort().join(',')}`;
    if (fetchKey === lastFetchRef.current) return;
    lastFetchRef.current = fetchKey;

    performSearch(query, page, selectedBooks);
  }, [query, page, selectedBooks, performSearch]);

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

  return (
    <ProtectedRoute>
      <div className="pb-8">
        <h1 className="text-3xl font-bold text-center text-primary mb-6 pt-8">Maktabah Search</h1>

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
          {query && (
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
          )}
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
