'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FiBookmark } from 'react-icons/fi';
import { SearchResult } from '@/types';
import { useBookmarks, generateVerseId } from '@/lib/bookmarks';
import { useAuth } from './AuthProvider';

interface BookmarkButtonProps {
  result: SearchResult;
  className?: string;
}

export default function BookmarkButton({ result, className = '' }: BookmarkButtonProps): JSX.Element {
  const { user, signInWithGoogle } = useAuth();
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarks();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // Captures intent when an anonymous user clicks bookmark. The useEffect
  // below fires the add once the auth state listener flips `user` to truthy.
  // If the user closes the Google popup without signing in, the ref stays set
  // and a later sign-in from any path will complete the add — they wanted it.
  const pendingAddRef = useRef<SearchResult | null>(null);

  const verseId = generateVerseId(result);
  const bookmarked = isBookmarked(verseId);

  // After login, complete any pending add this button captured.
  useEffect(() => {
    if (!user || !pendingAddRef.current) return;
    const pending = pendingAddRef.current;
    pendingAddRef.current = null;
    addBookmark(pending).catch((err) => {
      console.error('Error adding deferred bookmark:', err);
    });
  }, [user, addBookmark]);

  const handleToggleBookmark = async (e: React.MouseEvent): Promise<void> => {
    // Prevent event from bubbling to parent (which toggles expand/collapse)
    e.stopPropagation();

    if (isLoading) return;

    // Anonymous click: stash the intent and prompt login. The useEffect on
    // user state above will complete the add when login succeeds.
    if (!user) {
      pendingAddRef.current = result;
      await signInWithGoogle();
      return;
    }

    setIsLoading(true);

    try {
      if (bookmarked) {
        await removeBookmark(verseId);
      } else {
        await addBookmark(result);
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggleBookmark}
      disabled={isLoading}
      className={`flex items-center justify-center transition-all duration-200 hover:scale-110 ${
        isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      } ${className}`}
      aria-label={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
      title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}
    >
      {bookmarked ? (
        <FiBookmark 
          className="w-5 h-5 text-primary fill-current" 
          style={{ fill: 'currentColor' }}
        />
      ) : (
        <FiBookmark 
          className="w-5 h-5 text-gray-400 hover:text-primary" 
        />
      )}
    </button>
  );
}
