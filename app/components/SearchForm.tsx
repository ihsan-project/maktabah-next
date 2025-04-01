'use client';

import React, { useState, useRef, useEffect } from 'react';
import { FiSearch, FiHelpCircle, FiX } from 'react-icons/fi';
import { SearchFormProps } from '@/types';

export default function SearchForm({ onSearch }: SearchFormProps): JSX.Element {
  const [query, setQuery] = useState<string>('');
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
              className="input py-3 pl-4 pr-12 text-lg shadow-sm w-full"
              disabled={isSearching}
            />
            <button
              type="submit"
              disabled={isSearching}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-primary focus:outline-none"
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
            className="ml-2 text-gray-500 hover:text-primary focus:outline-none transition-colors duration-200"
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
                className="text-gray-400 hover:text-gray-600 focus:outline-none"
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
                    <li>Results include exact and similar words</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">mercy forgiveness</span></li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Exact Phrases</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Put quotes around exact phrases</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">"path of Allah"</span></li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Required Terms</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Add + before a word to require it</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">+faith hope</span></li>
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-primary-dark">Excluded Terms</h4>
                  <ul className="list-disc ml-5 text-gray-600 space-y-1">
                    <li>Add - before a word to exclude it</li>
                    <li>Example: <span className="font-mono bg-gray-100 px-1">light -darkness</span></li>
                  </ul>
                </div>
              </div>
              
              <p className="text-gray-500 italic">Tip: Use simple, clear terms for better results. The search is optimized to find variations of words (e.g., "believe" will also find "belief" and "believer").</p>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
