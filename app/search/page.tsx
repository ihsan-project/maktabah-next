'use client';

import React, { useState } from 'react';
import SearchForm from '@/app/components/SearchForm';
import SearchResults from '@/app/components/SearchResults';
import StoriesList from '@/app/components/StoriesList';
import ProtectedRoute from '@/app/components/ProtectedRoute';
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

  // Get the appropriate API URL based on environment
  const getApiUrl = (query: string, page: number): string => {
    // Check if we're in development mode and running locally
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Use Firebase emulator URL in development, API route in production
    const baseUrl = isDevelopment
      ? 'http://127.0.0.1:5001/maktabah-8ac04/us-central1/nextApiHandler/api/search'
      : `/api/search`;
    
    return `${baseUrl}?q=${encodeURIComponent(query)}&page=${page}&size=10`;
  };

  const performSearch = async (query: string, page: number = 1, append: boolean = false): Promise<void> => {
    setLoading(true);
    try {
      const apiUrl = getApiUrl(query, page);
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
      page: 1
    });
    
    await performSearch(query);
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

  const handleClearSearch = (): void => {
    setSearchQuery('');
    setResults([]);
    setTotalResults(0);
    setHasMore(false);
    
    // Track clear search event
    MixpanelTracking.track('Clear Search', {
      previous_query: searchQuery
    });
  };

  // Determine if we should show the stories list
  const showStoriesList = !searchQuery || (searchQuery && results.length === 0 && !loading);

  return (
    <ProtectedRoute>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">Maktabah Search</h1>
        
        <SearchForm onSearch={handleSearch} />
        
        {searchQuery && (
          <div className="mb-4 flex justify-between items-center">
            <p className="text-gray-600">
              {totalResults > 0 ? (
                <>Found {totalResults} results for "{searchQuery}"</>
              ) : loading ? (
                <>Searching for "{searchQuery}"...</>
              ) : (
                <>No results found for "{searchQuery}"</>
              )}
            </p>
            
            {/* Clear search button */}
            {(totalResults > 0 || (!loading && results.length === 0)) && (
              <button
                onClick={handleClearSearch}
                className="text-sm text-primary hover:text-primary-dark focus:outline-none"
              >
                Clear search
              </button>
            )}
          </div>
        )}
        
        <SearchResults 
          results={results} 
          loading={loading} 
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
        />
        
        {/* Show stories list if no search or empty results */}
        {showStoriesList && (
          <div className={`mt-12 ${results.length === 0 && searchQuery ? 'pt-8 border-t border-gray-200' : ''}`}>
            <StoriesList source="search_page" />
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
