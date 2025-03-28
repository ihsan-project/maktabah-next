'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FiChevronRight, FiChevronDown } from 'react-icons/fi';
import { SearchResultsProps, SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';
import ExpandedSearchResult from './ExpandedSearchResult';

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
  const toggleExpand = (id: string, result: SearchResult): void => {
    const newState = !expandedItems[id];
    
    setExpandedItems(prev => ({
      ...prev,
      [id]: newState
    }));
    
    // Track expand/collapse event
    MixpanelTracking.track(newState ? 'Expand Result' : 'Collapse Result', {
      resultId: id,
      chapter: result.chapter,
      verse: result.verse,
      author: result.author,
      book_id: result.book_id,
      title: result.title
    });
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

  // Get border color based on title
  const getBorderColor = (title?: string): string => {
    if (title === 'bukhari') {
      return 'border-l-[#8C6564]'; // Burgundy/maroon color for Bukhari
    }
    return 'border-l-primary'; // Default green for Quran
  };

  return (
    <div className="space-y-6">
      {results.map((result: SearchResult) => {
        const isExpanded = expandedItems[result.id] || false;
        const borderColor = getBorderColor(result.title);
        
        return (
          <div 
            key={result.id} 
            className={`card border-l-4 ${borderColor} hover:shadow-lg transition-shadow duration-200`}
          >
            <div 
              className="flex flex-col cursor-pointer" 
              onClick={() => toggleExpand(result.id, result)}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="font-medium text-primary">
                  {result.chapter}:{result.verse}
                </div>
                <div className="flex items-center text-xs text-gray-500">
                  {result.title === 'bukhari' && (
                    <span className="px-2 py-0.5 mr-2 rounded-full bg-[#8C6564] text-white">
                      Bukhari
                    </span>
                  )}
                  {result.author}
                </div>
              </div>
              
              <div className="text-gray-700">
                {isExpanded ? (
                  <>
                    <div className="mb-4">
                      <p>{result.text}</p>
                    </div>
                    
                    {result.title === 'bukhari' && result.volume && (
                      <div className="mt-2 mb-2">
                        <a 
                          href={`https://quranx.com/hadith/Bukhari/USC-MSA/Volume-${result.volume}/Book-${result.chapter}/Hadith-${result.verse}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-4 py-2 bg-[#8C6564] text-white rounded text-sm hover:bg-opacity-80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Track quranx.com link click
                            MixpanelTracking.track('QuranX Link Click', {
                              chapter: result.chapter,
                              verse: result.verse,
                              author: result.author,
                              book_id: result.book_id,
                              volume: result.volume
                            });
                          }}
                        >
                          View on QuranX.com
                        </a>
                      </div>
                    )}
                    
                    {result.title !== 'bukhari' && (
                      <ExpandedSearchResult result={result} />
                    )}
                  </>
                ) : (
                  <p>{result.text}</p>
                )}
              </div>
              
              <div className="flex justify-end mt-2 text-gray-400">
                {isExpanded ? (
                  <FiChevronDown size={20} />
                ) : (
                  <FiChevronRight size={20} />
                )}
              </div>
            </div>
          </div>
        );
      })}
      
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
