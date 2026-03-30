'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import SearchResults from '@/app/components/SearchResults';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider, useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';
import { useBookmarks } from '@/lib/bookmarks';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';

function BookmarksPageContent(): JSX.Element {
  const { bookmarks, loading } = useBookmarks();
  const hasTrackedCount = useRef(false);

  // Track page view once on mount
  useEffect(() => {
    MixpanelTracking.trackPageView('Bookmarks Page');
  }, []);

  // Track bookmark count once after initial load completes
  useEffect(() => {
    if (!loading && !hasTrackedCount.current) {
      MixpanelTracking.track('Bookmarks Page Viewed', {
        bookmarkCount: bookmarks.length
      });
      hasTrackedCount.current = true;
    }
  }, [loading, bookmarks.length]);

  // Convert bookmarks to SearchResult format
  const searchResults: SearchResult[] = useMemo(() => {
    return bookmarks.map((bookmark) => ({
      id: bookmark.id,
      score: 0, // Not relevant for bookmarks
      chapter: bookmark.chapter,
      verse: bookmark.verse,
      text: bookmark.text,
      author: bookmark.author,
      chapter_name: bookmark.chapter_name,
      book_id: bookmark.book_id,
      title: bookmark.title,
      volume: bookmark.volume,
      text_arabic_uthmani: bookmark.text_arabic_uthmani,
      surah_name: bookmark.surah_name,
      surah_name_arabic: bookmark.surah_name_arabic,
      surah_name_english: bookmark.surah_name_english,
      juz: bookmark.juz,
    }));
  }, [bookmarks]);

  const dictCtx = useWordDictionaryOptional();
  const isDrawerOpen = dictCtx?.isOpen ?? false;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            My Bookmarks
          </h1>
          {!loading && (
            <p className="text-gray-600">
              {bookmarks.length === 0
                ? 'No bookmarks yet'
                : `${bookmarks.length} ${bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}`}
            </p>
          )}
        </div>

        {/* Bookmarks Display */}
        {loading && bookmarks.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center py-16">
            <div className="max-w-md mx-auto">
              <svg
                className="w-24 h-24 mx-auto text-gray-300 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                No bookmarks yet
              </h2>
              <p className="text-gray-500 mb-6">
                Start bookmarking verses from search results to save them here for easy access.
              </p>
              <a
                href="/search"
                className="inline-block px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
              >
                Go to Search
              </a>
            </div>
          </div>
        ) : (
          <div className={`flex dict:flex-row dict:gap-3 ${isDrawerOpen ? 'flex-col fixed inset-0 z-40 pt-20 bg-[rgb(var(--background-rgb))] dict:relative dict:inset-auto dict:z-auto dict:bg-transparent dict:pt-0' : ''}`}>
            <div className={`flex-1 min-w-0 overflow-hidden ${isDrawerOpen ? 'overflow-y-auto px-4 dict:px-0' : ''}`}>
              <SearchResults
                results={searchResults}
                loading={loading}
                currentPage={1}
                totalPages={1}
                onPageChange={() => {}}
              />
            </div>
            <WordDrawer className="hidden dict:flex" />
            <WordBottomSheet className="dict:hidden" />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BookmarksPage(): JSX.Element {
  return (
    <ProtectedRoute>
      <WordDictionaryProvider>
        <BookmarksPageContent />
      </WordDictionaryProvider>
    </ProtectedRoute>
  );
}
