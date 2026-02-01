'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from '@/app/components/AuthProvider';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import TranslationCarousel from '@/app/components/TranslationCarousel';

interface Translation {
  author: string;
  text: string;
}

interface ProcessedVerse {
  key: number;
  chapter: string;
  verse: string;
  chapterName: string;
  bookId: string;
  score: string;
  translations: Translation[];
}

interface StoryClientProps {
  name: string;
  verses: ProcessedVerse[];
}

export default function StoryClient({ name, verses }: StoryClientProps) {
  // Get authentication state from AuthProvider
  const { user, loading } = useAuth();
  
  // State for selected translators
  const [selectedTranslators, setSelectedTranslators] = useState<string[]>([]);
  
  // Extract all unique translators from ALL verses (not just the first one)
  // This is important because stories can contain both Quran and Hadith with different translator names
  const availableTranslators = React.useMemo(() => {
    const translatorSet = new Set<string>();
    verses.forEach(verse => {
      verse.translations.forEach(t => {
        translatorSet.add(t.author);
      });
    });
    return Array.from(translatorSet).sort();
  }, [verses]);
  
  const trackSignIn = (location: string) => {
    MixpanelTracking.track('Click Sign In', {
      source: 'story_page',
      story_name: name,
      location: location
    });
  };
  
  const handleTranslatorSelectionChange = useCallback((selected: string[]) => {
    setSelectedTranslators(selected);
  }, []);
  
  return (
    <>
      {/* Login promotion section - only shown if not logged in */}
      {!user && !loading && (
        <div className="mb-8 p-6 bg-primary-light bg-opacity-10 rounded-lg text-center">
          <h2 className="text-xl font-semibold text-primary mb-2">Discover More Islamic Knowledge</h2>
          <p className="mb-4">
            Sign in to search the full collection of Islamic texts and create your own stories.
          </p>
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 py-3 px-6 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
            onClick={() => trackSignIn('top_banner')}
          >
            <FcGoogle className="text-xl" />
            <span>Sign in with Google</span>
          </Link>
        </div>
      )}
      
      {/* Translator Selector */}
      <TranslatorSelector
        availableTranslators={availableTranslators}
        onSelectionChange={handleTranslatorSelectionChange}
      />
      
      {/* Story verses - paragraph-style layout */}
      <div className="space-y-2">
        {verses.map((verse) => {
          // Filter translations based on selected translators
          const filteredTranslations = verse.translations.filter(t => 
            selectedTranslators.includes(t.author)
          );
          
          return (
            <div key={verse.key} className="mb-2">
              {/* Translation Carousel */}
              <TranslationCarousel
                translations={filteredTranslations}
                verseRef={`${verse.chapter}:${verse.verse}`}
                chapterName={verse.chapterName}
                tanzilUrl={`https://tanzil.net/#trans/${verse.bookId}/${verse.chapter}:${verse.verse}`}
                onTanzilClick={() => {
                  MixpanelTracking.track('Tanzil Link Click', {
                    chapter: verse.chapter,
                    verse: verse.verse,
                    source: 'story_page',
                    story_name: name
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
