'use client';

import React from 'react';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';
import TranslationView from './TranslationView';
import TextWithLineBreaks from './TextWithLineBreaks';

// Book IDs and author mappings
const BOOK_IDS = [
  'en.ahmedali',
  'en.ahmedraza',
  'en.arberry',
  'en.daryabadi',
  'en.hilali',
  'en.itani',
  'en.maududi',
  'en.mubarakpuri',
  'en.pickthall',
  'en.qarai',
  'en.qaribullah',
  'en.sahih',
  'en.sarwar',
  'en.shakir',
  'en.wahiduddin',
  'en.yusufali'
];

const AUTHOR_NAMES: Record<string, string> = {
  'en.ahmedali': 'Ahmed Ali',
  'en.ahmedraza': 'Ahmed Raza Khan',
  'en.arberry': 'Arberry',
  'en.daryabadi': 'Daryabadi',
  'en.hilali': 'Hilali & Khan',
  'en.itani': 'Itani',
  'en.maududi': 'Maududi',
  'en.mubarakpuri': 'Mubarakpuri',
  'en.pickthall': 'Pickthall',
  'en.qarai': 'Qarai',
  'en.qaribullah': 'Qaribullah & Darwish',
  'en.sahih': 'Saheeh International',
  'en.sarwar': 'Sarwar',
  'en.shakir': 'Shakir',
  'en.wahiduddin': 'Wahiduddin Khan',
  'en.yusufali': 'Yusuf Ali'
};

// Define props for this component
interface ExpandedSearchResultProps {
  result: SearchResult;
}

export default function ExpandedSearchResult({
  result
}: ExpandedSearchResultProps): JSX.Element {
  return (
    <div className="mt-2">
      {/* Display the original text with proper HTML rendering */}
      <div className="mb-4 pb-4 border-b">
        <h4 className="font-medium text-primary-dark mb-1">{result.author} (Original result):</h4>
        <TextWithLineBreaks text={result.text} />
      </div>
      
      {/* Top left Tanzil.net link */}
      {result.book_id && (
        <div className="mb-4">
          <a 
            href={`https://tanzil.net/#trans/${result.book_id}/${result.chapter}:${result.verse}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-dark"
            onClick={(e) => {
              e.stopPropagation();
              // Track tanzil.net link click
              MixpanelTracking.track('Tanzil Link Click', {
                chapter: result.chapter,
                verse: result.verse,
                author: result.author,
                book_id: result.book_id
              });
            }}
          >
            tanzil.net
          </a>
        </div>
      )}
      
      {/* List of translations */}
      <div className="space-y-4">
        {BOOK_IDS.map(bookId => (
          <TranslationView
            key={bookId}
            bookId={bookId}
            authorName={AUTHOR_NAMES[bookId]}
            chapter={result.chapter}
            verse={result.verse}
          />
        ))}
      </div>
    </div>
  );
}
