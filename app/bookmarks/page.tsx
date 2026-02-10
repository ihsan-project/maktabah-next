'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import SearchResults from '@/app/components/SearchResults';
import { useBookmarks } from '@/lib/bookmarks';
import { SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';

export default function BookmarksPage(): JSX.Element {
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
      volume: bookmark.volume
    }));
  }, [bookmarks]);

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
          <SearchResults
            results={searchResults}
            loading={loading}
            hasMore={false}
            onLoadMore={() => {}}
          />
        )}
      </div>
    </div>
  );
}
