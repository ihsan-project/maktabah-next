'use client';

import React from 'react';
import SearchForm from './SearchForm';

interface SearchHeroProps {
  onSearch: (query: string) => void;
  initialQuery?: string;
}

const QUICK_SEARCHES = [
  { label: 'Mercy', query: 'mercy' },
  { label: 'Patience', query: 'patience' },
  { label: 'Prayer', query: 'prayer' },
  { label: 'Forgiveness', query: 'forgiveness' },
  { label: 'Righteousness', query: 'righteousness' },
  { label: 'Gratitude', query: 'gratitude' },
];

/**
 * Shared search hero used by the `/` home page and the `/search` no-query
 * state. Title + large search bar + quick-search chips. The caller owns the
 * post-submit behavior via `onSearch` (home page pushes to /search; search
 * page updates its own URL state).
 */
export default function SearchHero({ onSearch, initialQuery = '' }: SearchHeroProps): JSX.Element {
  return (
    <div className="w-full flex flex-col items-center px-4">
      {/* Hero heading */}
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-3">Maktabah</h1>
        <p className="text-lg md:text-xl text-gray-600">Search the Quran and Hadith collections</p>
      </div>

      {/* Large search bar */}
      <div className="w-full max-w-3xl">
        <SearchForm onSearch={onSearch} initialQuery={initialQuery} size="large" />
      </div>

      {/* Quick search suggestions */}
      <div className="mt-10 text-center max-w-2xl">
        <p className="text-sm text-gray-500 mb-3">Try searching for</p>
        <div className="flex flex-wrap justify-center gap-2">
          {QUICK_SEARCHES.map(({ label, query: q }) => (
            <button
              key={q}
              onClick={() => onSearch(q)}
              className="px-4 py-2 text-sm rounded-full border border-primary/30 text-primary hover:bg-primary hover:text-white transition-colors duration-200"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
