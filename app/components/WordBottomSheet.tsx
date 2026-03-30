'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight, FiX } from 'react-icons/fi';
import { useWordDictionary } from '@/app/contexts/WordDictionaryContext';
import WordMorphologyContent from './WordMorphologyContent';

interface WordBottomSheetProps {
  className?: string;
}

const MIN_HEIGHT_VH = 30;
const DEFAULT_HEIGHT_VH = 40;
const MAX_HEIGHT_VH = 80;

export default function WordBottomSheet({ className = '' }: WordBottomSheetProps) {
  const {
    selectedWord,
    canGoNext,
    canGoPrev,
    isOpen,
    navigateWord,
    clearSelection,
  } = useWordDictionary();

  const [sheetHeight, setSheetHeight] = useState(DEFAULT_HEIGHT_VH);
  const dragStartRef = useRef<{ y: number; startHeight: number } | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset height when sheet opens
  useEffect(() => {
    if (isOpen) setSheetHeight(DEFAULT_HEIGHT_VH);
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Vertical drag to resize
  const handleDragStart = useCallback((e: React.TouchEvent) => {
    dragStartRef.current = {
      y: e.touches[0].clientY,
      startHeight: sheetHeight,
    };
  }, [sheetHeight]);

  const handleDragMove = useCallback((e: React.TouchEvent) => {
    if (!dragStartRef.current) return;
    const deltaY = dragStartRef.current.y - e.touches[0].clientY;
    const deltaVh = (deltaY / window.innerHeight) * 100;
    const newHeight = Math.min(MAX_HEIGHT_VH, Math.max(MIN_HEIGHT_VH, dragStartRef.current.startHeight + deltaVh));
    setSheetHeight(newHeight);
  }, []);

  const handleDragEnd = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  // Horizontal swipe to navigate words
  const handleSwipeStart = useCallback((e: React.TouchEvent) => {
    swipeStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleSwipeEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeStartRef.current) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartRef.current.x;
    const deltaY = Math.abs(e.changedTouches[0].clientY - swipeStartRef.current.y);
    swipeStartRef.current = null;

    // Only trigger if horizontal movement is dominant and exceeds threshold
    if (Math.abs(deltaX) > 50 && deltaY < 30) {
      if (deltaX > 0) {
        navigateWord('prev');
      } else {
        navigateWord('next');
      }
    }
  }, [navigateWord]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) clearSelection();
  }, [clearSelection]);

  if (!isOpen || !selectedWord) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black/40 word-modal-backdrop ${className}`}
      onClick={handleBackdropClick}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl word-modal-sheet flex flex-col"
        style={{ height: `${sheetHeight}vh` }}
        dir="ltr"
      >
        {/* Drag handle */}
        <div
          className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
        >
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header with navigation */}
        <div className="flex items-center justify-between px-4 py-1 shrink-0">
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

        {/* Scrollable content with swipe navigation */}
        <div
          ref={contentRef}
          className="overflow-y-auto flex-1 px-5 pb-6 pt-1"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <WordMorphologyContent word={selectedWord} />
        </div>
      </div>
    </div>
  );
}
