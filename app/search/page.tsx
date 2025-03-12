'use client';

import React, { useState } from 'react';
import SearchForm from '@/app/components/SearchForm';
import SearchResults from '@/app/components/SearchResults';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { SearchResult } from '@/types';

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
      console.log('mmi: 1');
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
    await performSearch(query);
  };

  const handleLoadMore = async (): Promise<void> => {
    if (hasMore && !loading) {
      await performSearch(searchQuery, currentPage + 1, true);
    }
  };

  return (
    <ProtectedRoute>
      <div className="py-8">
        <h1 className="text-3xl font-bold text-center text-primary mb-6">Maktabah Search</h1>
        
        <SearchForm onSearch={handleSearch} />
        
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
    </ProtectedRoute>
  );
}
