'use client';

import React from 'react';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import { useWordDictionary } from '@/app/contexts/WordDictionaryContext';
import WordMorphologyContent from './WordMorphologyContent';

interface WordDrawerProps {
  className?: string;
}

export default function WordDrawer({ className = '' }: WordDrawerProps) {
  const {
    selectedWord,
    canGoNext,
    canGoPrev,
    isOpen,
    navigateWord,
    clearSelection,
  } = useWordDictionary();

  if (!isOpen || !selectedWord) return null;

  return (
    <div
      className={`w-[38%] min-w-[320px] max-w-[480px] bg-white rounded-lg shadow-md sticky top-0 h-screen flex flex-col word-drawer-enter ${className}`}
      dir="ltr"
    >
      {/* Header with navigation */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigateWord('prev')}
            disabled={!canGoPrev}
            className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous word"
          >
            <FiChevronLeft size={18} />
          </button>
          <button
            onClick={() => navigateWord('next')}
            disabled={!canGoNext}
            className="p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Next word"
          >
            <FiChevronRight size={18} />
          </button>
        </div>
        <button
          onClick={clearSelection}
          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close dictionary"
        >
          <FiX size={18} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="overflow-y-auto flex-1 px-4 py-4">
        <WordMorphologyContent word={selectedWord} />
      </div>
    </div>
  );
}
