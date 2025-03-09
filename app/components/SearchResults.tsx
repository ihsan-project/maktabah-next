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
    if (!text) return null;
    return text.map((highlight: string, i: number) => (
      <span 
        key={i} 
        dangerouslySetInnerHTML={{ __html: highlight }}
      />
    ));
  };

  return (
    <div className="space-y-6">
      {results.map((result: SearchResult) => (
        <div key={result.id} className="card border-l-4 border-l-primary hover:shadow-lg transition-shadow duration-200">
          <div 
            className="flex items-start cursor-pointer" 
            onClick={() => toggleExpand(result.id)}
          >
            <div className="flex-1">
              <h3 className="text-lg font-medium text-primary mb-1">
                {result.highlights?.title ? (
                  renderHighlight(result.highlights.title)
                ) : (
                  result.title
                )}
              </h3>
              <p className="text-sm text-gray-500 mb-2">
                {result.author && <span>By {result.author} | </span>}
                {result.date && <span>{new Date(result.date).toLocaleDateString()}</span>}
              </p>
              <div className="text-gray-700">
                {expandedItems[result.id] ? (
                  <div className="mt-2">
                    {result.content}
                  </div>
                ) : (
                  <p className="line-clamp-2">
                    {result.highlights?.content ? (
                      renderHighlight(result.highlights.content)
                    ) : (
                      result.content
                    )}
                  </p>
                )}
              </div>
            </div>
            <div className="ml-4 mt-1 text-gray-400">
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
