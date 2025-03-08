'use client';

import React, { useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import { SearchFormProps } from '@/types';

export default function SearchForm({ onSearch }: SearchFormProps): JSX.Element {
  const [query, setQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

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

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Search for knowledge..."
          className="input py-3 pl-4 pr-12 text-lg shadow-sm"
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
      </form>
    </div>
  );
}
