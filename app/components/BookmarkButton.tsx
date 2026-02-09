'use client';

import React, { useState } from 'react';
import { FiBookmark } from 'react-icons/fi';
import { SearchResult } from '@/types';
import { useBookmarks, generateVerseId } from '@/lib/bookmarks';

interface BookmarkButtonProps {
  result: SearchResult;
  className?: string;
}

export default function BookmarkButton({ result, className = '' }: BookmarkButtonProps): JSX.Element {
  const { isBookmarked, addBookmark, removeBookmark } = useBookmarks();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const verseId = generateVerseId(result);
  const bookmarked = isBookmarked(verseId);

  const handleToggleBookmark = async (e: React.MouseEvent): Promise<void> => {
    // Prevent event from bubbling to parent (which toggles expand/collapse)
    e.stopPropagation();
    
    if (isLoading) return;

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
