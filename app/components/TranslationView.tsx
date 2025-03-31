'use client';

import React, { useEffect, useState } from 'react';
import { fetchVerse } from '@/lib/fetchVerse';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';

interface TranslationViewProps {
  bookId: string;
  authorName: string;
  chapter: number;
  verse: number;
  onToggleFavorite?: (bookId: string, isFavorite: boolean) => void;
}

// Local storage key for favorite translations
const FAVORITE_TRANSLATIONS_KEY = 'maktabah_favorite_translations';

export default function TranslationView({ 
  bookId, 
  authorName, 
  chapter, 
  verse,
  onToggleFavorite
}: TranslationViewProps): JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  // Check if this translation is in favorites when component mounts
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedFavorites = localStorage.getItem(FAVORITE_TRANSLATIONS_KEY);
      const favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
      setIsFavorite(favorites.includes(bookId));
    }
  }, [bookId]);

  // Load translation data
  useEffect(() => {
    const loadTranslation = async () => {
      setLoading(true);
      setError(false);
      
      try {
        const data = await fetchVerse(bookId, chapter, verse);
        
        if (data && data.text) {
          setText(data.text);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(`Error fetching ${bookId} translation:`, err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadTranslation();
  }, [bookId, chapter, verse]);

  // Toggle favorite status
  const toggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent event bubbling
    
    if (typeof window !== 'undefined') {
      const storedFavorites = localStorage.getItem(FAVORITE_TRANSLATIONS_KEY);
      const favorites = storedFavorites ? JSON.parse(storedFavorites) : [];
      
      let newFavorites;
      if (isFavorite) {
        // Remove from favorites
        newFavorites = favorites.filter((id: string) => id !== bookId);
      } else {
        // Add to favorites
        newFavorites = [...favorites, bookId];
      }
      
      // Update local storage
      localStorage.setItem(FAVORITE_TRANSLATIONS_KEY, JSON.stringify(newFavorites));
      
      // Update state
      setIsFavorite(!isFavorite);
      
      // Notify parent component if callback is provided
      if (onToggleFavorite) {
        onToggleFavorite(bookId, !isFavorite);
      }
      
      // Track the event
      MixpanelTracking.track('Translation Favorite Toggle', {
        bookId,
        authorName,
        isFavorite: !isFavorite,
        chapter,
        verse
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="h-4 w-4 border-t-2 border-b-2 border-primary animate-spin rounded-full"></div>
          <span className="text-gray-500">Loading translation...</span>
        </div>
        <button 
          onClick={toggleFavorite}
          className={`p-1 rounded-full ${isFavorite ? 'text-primary bg-primary-light bg-opacity-20' : 'text-gray-400'}`}
          title={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
          aria-label={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
        >
          {isFavorite ? <FiEye size={16} /> : <FiEyeOff size={16} />}
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between">
        <p className="text-gray-500 italic">Translation not available</p>
        <button 
          onClick={toggleFavorite}
          className={`p-1 rounded-full ${isFavorite ? 'text-primary bg-primary-light bg-opacity-20' : 'text-gray-400'}`}
          title={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
          aria-label={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
        >
          {isFavorite ? <FiEye size={16} /> : <FiEyeOff size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between">
      <p className="flex-1">{text}</p>
      <button 
        onClick={toggleFavorite}
        className={`p-1 ml-2 rounded-full ${isFavorite ? 'text-primary bg-primary-light bg-opacity-20' : 'text-gray-400'}`}
        title={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
        aria-label={isFavorite ? "Remove from auto-expand" : "Add to auto-expand"}
      >
        {isFavorite ? <FiEye size={16} /> : <FiEyeOff size={16} />}
      </button>
    </div>
  );
}
