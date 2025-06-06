'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FiSearch, FiHelpCircle, FiX } from 'react-icons/fi';
import { SearchFormProps } from '@/types';

// Update the SearchFormProps interface in /types/index.ts
interface UpdatedSearchFormProps extends SearchFormProps {
  initialQuery?: string;
}

export default function SearchForm({ onSearch, initialQuery = '' }: UpdatedSearchFormProps): JSX.Element {
  const [query, setQuery] = useState<string>(initialQuery);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [showTips, setShowTips] = useState<boolean>(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const helpIconRef = useRef<HTMLButtonElement>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    
    if (!query.trim()) return;
    
    setIsSearching(true);
    try {
      await onSearch(query.trim());
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearInput = (): void => {
    setQuery('');
    // If the input is cleared and Enter is pressed, 
    // this will trigger a search with an empty string
    // which can be handled in the parent component
  };

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        helpIconRef.current &&
        !helpIconRef.current.contains(event.target as Node)
      ) {
        setShowTips(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center">
          <div className="relative flex-grow">
            <input
              type="text"
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Search for knowledge..."
              className="input py-3 pl-4 pr-16 text-lg shadow-sm w-full"
              disabled={isSearching}
            />
            
            {/* Clear input button - only shown when there's text */}
            {query && (
              <button
                type="button"
                onClick={handleClearInput}
                className="absolute right-12 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none p-2"
                aria-label="Clear search"
              >
                <FiX size={20} />
              </button>
            )}
            
            <button
              type="submit"
              disabled={isSearching || !query.trim()}
              className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${query.trim() ? 'text-primary' : 'text-gray-400'} hover:text-primary-dark focus:outline-none`}
              aria-label="Search"
            >
              {isSearching ? (
                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div>
              ) : (
                <FiSearch size={24} />
              )}
            </button>
          </div>
          
          <button
            type="button"
            ref={helpIconRef}
            onClick={() => setShowTips(!showTips)}
            className="ml-4 text-gray-500 hover:text-primary focus:outline-none transition-colors duration-200 p-2"
            aria-label="Search tips"
          >
            <FiHelpCircle size={24} />
          </button>
        </div>
        
        {/* Search Tips Tooltip */}
        {showTips && (
          <div 
            ref={tooltipRef}
            className="absolute z-10 mt-2 p-4 bg-white rounded-lg shadow-lg border border-gray-200 w-full md:w-3/4 right-0"
          >
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-primary text-lg">Search Tips</h3>
              <button 
                onClick={() => setShowTips(false)}
                className="text-gray-400 hover:text-gray-600 focus:outline-none p-2"
              >
                <FiX size={20} />
              </button>
            </div>
            
            <div className="space-y-3 text-sm md:text-base">
              <p className="font-medium text-gray-700">Try these search techniques:</p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-primary-dark">Basic Search</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Type words or phrases naturally</li>
                    <li>Multiple words will match any of them</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">mercy forgiveness</span></li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Word Variations</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Search finds different forms of words</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">believe</span> finds "belief", "believer", etc.</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Partial Words</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Type beginnings of words to find matches</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">righ</span> finds "right", "righteous"</li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Key Concepts</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Use specific theological terms</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">taqwa ihsan</span></li>
                  </ul>
                </div>
              </div>
              
              <p className="text-gray-500 italic">Tip: Keep searches simple and focused. The search engine intelligently finds word matches, similar meanings, and partial word matches based on context.</p>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
