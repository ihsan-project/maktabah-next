'use client';

import React, { useState, useEffect } from 'react';
import { FiChevronRight, FiChevronDown, FiEye, FiEyeOff } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';

// Define types for the story verse data
interface Translation {
  book_id: string;
  author: string;
  available: string;
  _text: string;
}

interface StoryVerse {
  chapter: string;
  verse: string;
  author: string;
  chapter_name: string;
  book_id: string;
  score: string;
  text: string;
  translations: Translation[];
  title?: string;
  volume?: number;
}

// Book IDs and author mappings (same as in ExpandedSearchResult)
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
interface ExpandableStoryVerseProps {
  verse: StoryVerse;
  storyName: string;
}

// Helper function to render text with newlines
const TextWithLineBreaks = ({ text }: { text: string }) => {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? "mt-2" : ""}>
          {line}
        </div>
      ))}
    </>
  );
};

export default function ExpandableStoryVerse({ verse, storyName }: ExpandableStoryVerseProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  const [favoriteTranslations, setFavoriteTranslations] = useState<string[]>([]);

  // Get border color based on title
  const getBorderColor = (title?: string): string => {
    if (title === 'bukhari') {
      return 'border-l-[#8C6564]'; // Burgundy/maroon color for Bukhari
    }
    return 'border-l-primary'; // Default green for Quran
  };

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

  // Toggle expanded state for the verse
  const toggleExpand = (): void => {
    const newState = !isExpanded;
    setIsExpanded(newState);
    
    // Track expand/collapse event
    MixpanelTracking.track(newState ? 'Expand Story Verse' : 'Collapse Story Verse', {
      storyName: storyName,
      chapter: verse.chapter,
      verse: verse.verse,
      author: verse.author,
      book_id: verse.book_id,
      title: verse.title,
      volume: verse.volume
    });
  };

  // Function to toggle a translation's expanded state
  const toggleTranslation = (bookId: string): void => {
    setExpandedTranslations(prev => ({
      ...prev,
      [bookId]: !prev[bookId]
    }));

    // Track when a translation is expanded
    if (!expandedTranslations[bookId]) {
      MixpanelTracking.track('Translation Expanded', {
        storyName: storyName,
        bookId,
        authorName: AUTHOR_NAMES[bookId],
        chapter: verse.chapter,
        verse: verse.verse
      });
    }
  };

  // Handle favorite toggle
  const handleToggleFavorite = (bookId: string, isFavorite: boolean) => {
    // If marking as favorite and not already expanded, expand it
    if (isFavorite && !expandedTranslations[bookId]) {
      setExpandedTranslations(prev => ({
        ...prev,
        [bookId]: true
      }));
    }
    
    // Update local favorite translations list
    const newFavorites = isFavorite 
      ? [...favoriteTranslations, bookId] 
      : favoriteTranslations.filter(id => id !== bookId);
    
    setFavoriteTranslations(newFavorites);
    localStorage.setItem(FAVORITE_TRANSLATIONS_KEY, JSON.stringify(newFavorites));
    
    // Track the event
    MixpanelTracking.track('Translation Favorite Toggle', {
      storyName: storyName,
      bookId,
      authorName: AUTHOR_NAMES[bookId],
      isFavorite,
      chapter: verse.chapter,
      verse: verse.verse
    });
  };

  const isBukhari = verse.title === 'bukhari';
  const borderColor = getBorderColor(verse.title);
  
  return (
    <div className={`card border-l-4 ${borderColor} hover:shadow-lg transition-shadow duration-200 mb-6`}>
      <div className="flex flex-col cursor-pointer" onClick={toggleExpand}>
        <div className="flex justify-between items-center mb-2">
          <div className="font-medium text-primary">
            {verse.chapter}:{verse.verse}
          </div>
          <div className="flex items-center text-xs text-gray-500">
            {isBukhari && (
              <span className="px-2 py-0.5 mr-2 rounded-full bg-[#8C6564] text-white">
                Bukhari
                {verse.volume && ` Vol ${verse.volume}`}
              </span>
            )}
            {verse.author}
          </div>
        </div>
        
        <div className="text-gray-700">
          {isExpanded ? (
            <>
              <div className="mb-4">
                <TextWithLineBreaks text={verse.text} />
              </div>
              
              {isBukhari && verse.volume && (
                <div className="mt-2 mb-2">
                  <a 
                    href={`https://quranx.com/hadith/Bukhari/USC-MSA/Volume-${verse.volume}/Book-${verse.chapter}/Hadith-${verse.verse}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 bg-[#8C6564] text-white rounded text-sm hover:bg-opacity-80 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Track quranx.com link click
                      MixpanelTracking.track('QuranX Link Click', {
                        storyName: storyName,
                        chapter: verse.chapter,
                        verse: verse.verse,
                        author: verse.author,
                        book_id: verse.book_id,
                        volume: verse.volume
                      });
                    }}
                  >
                    View on QuranX.com
                  </a>
                </div>
              )}
              
              {!isBukhari && verse.book_id && (
                <div className="flex justify-between items-center mb-4 pb-3 border-b">
                  <h3 className="font-medium text-lg text-primary">Translations</h3>
                  <a 
                    href={`https://tanzil.net/#trans/${verse.book_id}/${verse.chapter}:${verse.verse}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-dark"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Track tanzil.net link click
                      MixpanelTracking.track('Tanzil Link Click', {
                        storyName: storyName,
                        chapter: verse.chapter,
                        verse: verse.verse,
                        author: verse.author,
                        book_id: verse.book_id
                      });
                    }}
                  >
                    View on tanzil.net
                  </a>
                </div>
              )}
              
              {/* Only show translations section for Quran verses */}
              {!isBukhari && verse.translations && (
                <div className="space-y-3">
                  <h3 className="font-medium text-lg text-primary">Other Translations</h3>
                  
                  {verse.translations.map(translation => {
                    // Skip if it's the same as the main verse or if not available
                    if (
                      translation.book_id === verse.book_id || 
                      translation.available === "false" || 
                      !translation._text
                    ) return null;
                    
                    const bookId = translation.book_id;
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
                          <h4 className="font-medium">{translation.author}</h4>
                          <span className="text-gray-500">
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                        
                        {isExpanded && (
                          <div className="p-3 border-t">
                            <div className="flex items-start justify-between">
                              <p className="flex-1"><TextWithLineBreaks text={translation._text} /></p>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleFavorite(bookId, !isFavorite);
                                }}
                                className={`p-1 ml-2 rounded-full ${isFavorite ? 'text-primary bg-primary-light bg-opacity-20' : 'text-gray-400'}`}
                                title={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
                                aria-label={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
                              >
                                {isFavorite ? <FiEye size={16} /> : <FiEyeOff size={16} />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              )}
            </>
          ) : (
            <p>
              <TextWithLineBreaks text={verse.text} />
            </p>
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
}
