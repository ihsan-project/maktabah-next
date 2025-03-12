'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FiChevronRight, FiChevronDown } from 'react-icons/fi';
import { SearchResultsProps, SearchResult } from '@/types';

export default function SearchResults({ 
  results, 
  loading, 
  hasMore, 
  onLoadMore 
}: SearchResultsProps): JSX.Element {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  // Toggle expanded state for a result item
  const toggleExpand = (id: string): void => {
    setExpandedItems(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Set up intersection observer for infinite scrolling
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.5 }
    );

    observerRef.current = observer;

    if (loadMoreRef.current && hasMore) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, onLoadMore]);

  if (loading && !results.length) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!loading && !results.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-lg">No results found. Try a different search term.</p>
      </div>
    );
  }

  // Render highlighted text safely
  const renderHighlight = (text: string[] | undefined): React.ReactNode => {
    if (!text || text.length === 0) return null;
    return <div dangerouslySetInnerHTML={{ __html: text[0] }} />;
  };

  return (
    <div className="space-y-6">
      {results.map((result: SearchResult) => (
        <div key={result.id} className="card border-l-4 border-l-primary hover:shadow-lg transition-shadow duration-200">
          <div 
            className="flex flex-col cursor-pointer" 
            onClick={() => toggleExpand(result.id)}
          >
            <div className="flex justify-between items-center mb-2">
              <div className="font-medium text-primary">
                {result.chapter}:{result.verse}
              </div>
              <div className="text-xs text-gray-500">
                {result.translator}
              </div>
            </div>
            
            <div className="text-gray-700">
              {result.highlights && result.highlights.length > 0 ? (
                renderHighlight(result.highlights)
              ) : (
                <div>{result.text}</div>
              )}
            </div>
            
            <div className="flex justify-end mt-2 text-gray-400">
              {expandedItems[result.id] ? (
                <FiChevronDown size={20} />
              ) : (
                <FiChevronRight size={20} />
              )}
            </div>
          </div>
        </div>
      ))}
      
      {hasMore && (
        <div 
          ref={loadMoreRef} 
          className="flex justify-center py-4"
        >
          {loading ? (
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          ) : (
            <p className="text-gray-500">Loading more results...</p>
          )}
        </div>
      )}
    </div>
  );
}
