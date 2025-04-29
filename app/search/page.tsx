'use client';

import React, { useState, useEffect } from 'react';
import SearchForm from '@/app/components/SearchForm';
import SearchResults from '@/app/components/SearchResults';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import BookFilter from '@/app/components/BookFilter';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';

export default function SearchPage(): JSX.Element {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]);

  // Get the appropriate API URL based on environment
  const getApiUrl = (query: string, page: number, bookFilter?: string): string => {
    // Check if we're in development mode and running locally
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Use Firebase emulator URL in development, API route in production
    const baseUrl = isDevelopment
      ? 'http://127.0.0.1:5001/maktabah-8ac04/us-central1/nextApiHandler/api/search'
      : `/api/search`;
    
    let url = `${baseUrl}?q=${encodeURIComponent(query)}&page=${page}&size=10`;
    
    // Add book filter if provided
    if (bookFilter) {
      url += `&title=${encodeURIComponent(bookFilter)}`;
    }
    
    return url;
  };

  const performSearch = async (query: string, page: number = 1, append: boolean = false): Promise<void> => {
    setLoading(true);
    try {
      // Get the current book filter if any
      const bookFilter = selectedBooks.length > 0 ? selectedBooks[0] : '';
      const apiUrl = getApiUrl(query, page, bookFilter);
      console.log('Searching using API URL:', apiUrl); // Debug log
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error('Search request failed');
      }
      
      const data = await response.json();
      
      setTotalResults(data.total);
      setTotalPages(data.totalPages);
      setHasMore(page < data.totalPages);
      
      if (append) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      
      setCurrentPage(page);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string): Promise<void> => {
    setSearchQuery(query);
    
    // Track search event
    MixpanelTracking.track('Search', {
      query: query,
      page: 1,
      bookFilter: selectedBooks.length > 0 ? selectedBooks[0] : 'all'
    });
    
    await performSearch(query);
  };
  
  const handleBookFilterChange = (books: string[]): void => {
    setSelectedBooks(books);
    
    // If there's already a search query, update results with the new filter
    if (searchQuery) {
      // Track filter change event
      MixpanelTracking.track('Change Book Filter', {
        filter: books.length > 0 ? books[0] : 'all',
        query: searchQuery
      });
      
      performSearch(searchQuery, 1, false);
    }
  };

  const handleLoadMore = async (): Promise<void> => {
    if (hasMore && !loading) {
      const nextPage = currentPage + 1;
      
      // Track pagination event
      MixpanelTracking.track('Load More Results', {
        query: searchQuery,
        page: nextPage
      });
      
      await performSearch(searchQuery, nextPage, true);
    }
  };

  return (
    <ProtectedRoute>
      <div className="pb-8">
        <h1 className="text-3xl font-bold text-center text-primary mb-6 pt-8">Maktabah Search</h1>
        
        {/* Sticky Search Form Container */}
        <div className="sticky top-0 z-10 bg-secondary py-4 shadow-md">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row gap-4 items-center">
              <div className="w-full md:w-1/4">
                <BookFilter 
                  selectedBooks={selectedBooks} 
                  onChange={handleBookFilterChange} 
                />
              </div>
              <div className="w-full md:w-3/4">
                <SearchForm onSearch={handleSearch} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Results section with search info */}
        <div className="mt-4 container mx-auto px-4">
          {searchQuery && (
            <div className="mb-4">
              <p className="text-gray-600">
                {totalResults > 0 ? (
                  <>Found {totalResults} results for "{searchQuery}"</>
                ) : loading ? (
                  <>Searching for "{searchQuery}"...</>
                ) : (
                  <>No results found for "{searchQuery}"</>
                )}
              </p>
            </div>
          )}
          <SearchResults 
            results={results} 
            loading={loading} 
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
