'use client';

import React, { useState, useEffect } from 'react';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';
import TranslationView from './TranslationView';

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

// Local storage key for favorite translations
const FAVORITE_TRANSLATIONS_KEY = 'maktabah_favorite_translations';

// Define props for this component
interface ExpandedSearchResultProps {
  result: SearchResult;
}

export default function ExpandedSearchResult({
  result
}: ExpandedSearchResultProps): JSX.Element {
  // State to track which translations are expanded
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  const [favoriteTranslations, setFavoriteTranslations] = useState<string[]>([]);

  // Load favorite translations from local storage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedFavorites = localStorage.getItem(FAVORITE_TRANSLATIONS_KEY);
      const favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
      setFavoriteTranslations(favorites);
      
      // Auto-expand favorite translations
      const initialExpanded: Record<string, boolean> = {};
      favorites.forEach((bookId: string) => {
        initialExpanded[bookId] = true;
      });
      setExpandedTranslations(initialExpanded);
    }
  }, []);

  // Function to toggle a translation's expanded state
  const toggleTranslation = (bookId: string): void => {
    setExpandedTranslations(prev => ({
      ...prev,
      [bookId]: !prev[bookId]
    }));

    // Track when a translation is expanded
    if (!expandedTranslations[bookId]) {
      MixpanelTracking.track('Translation Expanded', {
        bookId,
        authorName: AUTHOR_NAMES[bookId],
        chapter: result.chapter,
        verse: result.verse
      });
    }
  };

  // Handle favorite toggle from TranslationView
  const handleToggleFavorite = (bookId: string, isFavorite: boolean) => {
    // If marking as favorite and not already expanded, expand it
    if (isFavorite && !expandedTranslations[bookId]) {
      setExpandedTranslations(prev => ({
        ...prev,
        [bookId]: true
      }));
    }
    
    // Update local favorite translations list
    setFavoriteTranslations(prev => 
      isFavorite 
        ? [...prev, bookId] 
        : prev.filter(id => id !== bookId)
    );
  };

  return (
    <div className="mt-2">
      {/* Tanzil.net link */}
      {result.book_id && (
        <div className="flex justify-between items-center mb-4 pb-3 border-b">
          <h3 className="font-medium text-lg text-primary">Translations</h3>
          <a 
            href={`https://tanzil.net/#trans/${result.book_id}/${result.chapter}:${result.verse}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-dark"
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
            View on tanzil.net
          </a>
        </div>
      )}
      
      {/* Collapsible translations */}
      <div className="space-y-3">
        <h3 className="font-medium text-lg text-primary">Other Translations</h3>
        
        {BOOK_IDS.map(bookId => {
          // Skip the translation that's already shown in search results (if that's the case)
          if (bookId === result.book_id) return null;
          
          const isExpanded = expandedTranslations[bookId] || false;
          const isFavorite = favoriteTranslations.includes(bookId);
          
          return (
            <div key={bookId} className={`border rounded-md overflow-hidden ${isFavorite ? 'border-primary-light' : ''}`}>
              <div 
                className={`flex justify-between items-center p-3 ${isFavorite ? 'bg-primary-light bg-opacity-10' : 'bg-gray-50'} cursor-pointer hover:bg-gray-100`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTranslation(bookId);
                }}
              >
                <h4 className="font-medium">{AUTHOR_NAMES[bookId]}</h4>
                <span className="text-gray-500">
                  {isExpanded ? '▼' : '▶'}
                </span>
              </div>
              
              {isExpanded && (
                <div className="p-3 border-t">
                  <TranslationView
                    bookId={bookId}
                    authorName={AUTHOR_NAMES[bookId]}
                    chapter={result.chapter}
                    verse={result.verse}
                    onToggleFavorite={handleToggleFavorite}
                  />
                </div>
              )}
            </div>
          );
        }).filter(Boolean)}
      </div>
    </div>
  );
}
