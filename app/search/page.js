'use client';

import { useState } from 'react';
import SearchForm from '@/app/components/SearchForm';
import SearchResults from '@/app/components/SearchResults';
import ProtectedRoute from '@/app/components/ProtectedRoute';

export default function SearchPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const performSearch = async (query, page = 1, append = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}&size=10`);
      
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

  const handleSearch = async (query) => {
    setSearchQuery(query);
    await performSearch(query);
  };

  const handleLoadMore = async () => {
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
