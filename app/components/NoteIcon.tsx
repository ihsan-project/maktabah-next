'use client';

import React from 'react';
import Link from 'next/link';
import { FiFileText, FiEdit3 } from 'react-icons/fi';

interface NoteIconProps {
  verseId: string;
  hasNotes: boolean;
  className?: string;
}

/**
 * Icon component for accessing notes on bookmarked verses
 * Shows filled icon if notes exist, outline icon if empty
 */
export default function NoteIcon({ verseId, hasNotes, className = '' }: NoteIconProps): JSX.Element {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click handlers
  };

  return (
    <Link
      href={`/bookmarks/notes/${verseId}`}
      onClick={handleClick}
      className={`flex items-center justify-center transition-all duration-200 hover:scale-110 cursor-pointer ${className}`}
      aria-label={hasNotes ? 'Edit notes' : 'Add notes'}
      title={hasNotes ? 'Edit notes' : 'Add notes'}
      prefetch={true}
    >
      {hasNotes ? (
        <FiFileText 
          className="w-5 h-5 text-primary fill-current" 
          style={{ fill: 'currentColor' }}
        />
      ) : (
        <FiEdit3 
          className="w-5 h-5 text-gray-400 hover:text-primary" 
        />
      )}
    </Link>
  );
}
