'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
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

// Configuration for virtual scrolling
const INITIAL_VERSES = 20; // Initial verses to load
const VERSES_BUFFER = 10; // Verses to keep before/after visible area
const LOAD_MORE_THRESHOLD = 5; // Trigger load when this many verses from bottom

export default function StoryClient({ name, verses }: StoryClientProps) {
  // Get authentication state from AuthProvider
  const { user, loading } = useAuth();
  
  // State for selected translators
  const [selectedTranslators, setSelectedTranslators] = useState<string[]>([]);
  
  // State for virtual scrolling - track which range of verses to render
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: INITIAL_VERSES });
  
  // Refs for intersection observer
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
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
  
  // Function to extend the visible range downward
  const loadMoreVerses = useCallback(() => {
    setVisibleRange(prev => {
      const newEnd = Math.min(prev.end + INITIAL_VERSES, verses.length);
      // Keep only a window of verses to limit DOM size
      const maxWindow = 50; // Keep max 50 verses in DOM
      const newStart = Math.max(0, newEnd - maxWindow);
      
      if (newEnd > prev.end) {
        MixpanelTracking.track('Load More Verses', {
          story_name: name,
          previous_end: prev.end,
          new_end: newEnd,
          total_verses: verses.length
        });
      }
      
      return { start: newStart, end: newEnd };
    });
  }, [verses.length, name]);
  
  // Function to extend the visible range upward (when scrolling back up)
  const loadPreviousVerses = useCallback(() => {
    setVisibleRange(prev => {
      if (prev.start === 0) return prev; // Already at the top
      
      const newStart = Math.max(0, prev.start - INITIAL_VERSES);
      // Keep only a window of verses to limit DOM size
      const maxWindow = 50; // Keep max 50 verses in DOM
      const newEnd = Math.min(verses.length, newStart + maxWindow);
      
      return { start: newStart, end: newEnd };
    });
  }, [verses.length]);
  
  // Set up intersection observer for infinite scroll (bottom)
  useEffect(() => {
    const bottomSentinel = bottomSentinelRef.current;
    if (!bottomSentinel) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && visibleRange.end < verses.length) {
          loadMoreVerses();
        }
      },
      {
        root: null,
        rootMargin: '200px', // Start loading 200px before reaching the sentinel
        threshold: 0.1
      }
    );
    
    observer.observe(bottomSentinel);
    
    return () => {
      observer.disconnect();
    };
  }, [visibleRange.end, verses.length, loadMoreVerses]);
  
  // Set up intersection observer for loading previous verses (top)
  useEffect(() => {
    const topSentinel = topSentinelRef.current;
    if (!topSentinel || visibleRange.start === 0) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && visibleRange.start > 0) {
          loadPreviousVerses();
        }
      },
      {
        root: null,
        rootMargin: '200px',
        threshold: 0.1
      }
    );
    
    observer.observe(topSentinel);
    
    return () => {
      observer.disconnect();
    };
  }, [visibleRange.start, loadPreviousVerses]);
  
  // Get the verses to display (within the visible range)
  const displayedVerses = verses.slice(visibleRange.start, visibleRange.end);
  const hasMoreVerses = visibleRange.end < verses.length;
  
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
      
      {/* Story verses - paragraph-style layout with virtual scrolling */}
      <div ref={containerRef} className="space-y-2">
        {/* Top sentinel for detecting scroll up */}
        <div ref={topSentinelRef} style={{ height: '1px' }} />
        
        {/* Info about scrolled past verses */}
        {visibleRange.start > 0 && (
          <div className="py-4 text-center text-sm text-gray-500 bg-gray-50 rounded">
            ↑ Scroll up to load verses 1-{visibleRange.start}
          </div>
        )}
        
        {/* Rendered verses */}
        {displayedVerses.map((verse, index) => {
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
        
        {/* Bottom sentinel for detecting when to load more */}
        {hasMoreVerses && (
          <>
            <div ref={bottomSentinelRef} style={{ height: '1px' }} />
            <div className="py-4 text-center">
              <div className="text-sm text-gray-500">
                Loading more verses... ({visibleRange.end} of {verses.length})
              </div>
            </div>
          </>
        )}
        
        {/* All verses loaded message */}
        {!hasMoreVerses && verses.length > INITIAL_VERSES && (
          <div className="mt-8 text-center">
            <p className="text-gray-600">
              You've reached the end of the story ({verses.length} verses)
            </p>
          </div>
        )}
      </div>
    </>
  );
}
