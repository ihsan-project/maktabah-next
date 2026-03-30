'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { QuranWord } from '@/types';

export interface WordLocation {
  chapter: number;
  verse: number;
  position: number;
}

export interface RegisteredWord {
  chapter: number;
  verse: number;
  word: QuranWord;
  element: HTMLElement | null;
}

interface WordDictionaryContextValue {
  selectedWord: QuranWord | null;
  selectedLocation: WordLocation | null;
  currentWordIndex: number;
  totalWords: number;
  canGoNext: boolean;
  canGoPrev: boolean;
  isOpen: boolean;
  selectWord: (chapter: number, verse: number, word: QuranWord) => void;
  navigateWord: (direction: 'prev' | 'next') => void;
  clearSelection: () => void;
  registerWords: (id: string, chapter: number, verse: number, words: QuranWord[], elements: Map<number, HTMLElement>) => void;
  unregisterWords: (id: string) => void;
}

const WordDictionaryContext = createContext<WordDictionaryContextValue | null>(null);

export function useWordDictionary() {
  const ctx = useContext(WordDictionaryContext);
  if (!ctx) throw new Error('useWordDictionary must be used within WordDictionaryProvider');
  return ctx;
}

export function useWordDictionaryOptional() {
  return useContext(WordDictionaryContext);
}

interface RegisteredGroup {
  id: string;
  chapter: number;
  verse: number;
  words: QuranWord[];
  elements: Map<number, HTMLElement>;
}

export function WordDictionaryProvider({ children }: { children: React.ReactNode }) {
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WordLocation | null>(null);
  const groupsRef = useRef<RegisteredGroup[]>([]);
  const [flatWords, setFlatWords] = useState<RegisteredWord[]>([]);

  const rebuildFlatList = useCallback(() => {
    const sorted = [...groupsRef.current].sort((a, b) => {
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
    const flat: RegisteredWord[] = [];
    for (const group of sorted) {
      for (const word of group.words) {
        flat.push({
          chapter: group.chapter,
          verse: group.verse,
          word,
          element: group.elements.get(word.position) ?? null,
        });
      }
    }
    setFlatWords(flat);
  }, []);

  const registerWords = useCallback((id: string, chapter: number, verse: number, words: QuranWord[], elements: Map<number, HTMLElement>) => {
    const existing = groupsRef.current.findIndex(g => g.id === id);
    if (existing >= 0) {
      groupsRef.current[existing] = { id, chapter, verse, words, elements };
    } else {
      groupsRef.current.push({ id, chapter, verse, words, elements });
    }
    rebuildFlatList();
  }, [rebuildFlatList]);

  const unregisterWords = useCallback((id: string) => {
    groupsRef.current = groupsRef.current.filter(g => g.id !== id);
    rebuildFlatList();
  }, [rebuildFlatList]);

  const currentWordIndex = selectedLocation
    ? flatWords.findIndex(w =>
        w.chapter === selectedLocation.chapter &&
        w.verse === selectedLocation.verse &&
        w.word.position === selectedLocation.position
      )
    : -1;

  const canGoPrev = currentWordIndex > 0;
  const canGoNext = currentWordIndex >= 0 && currentWordIndex < flatWords.length - 1;

  const selectWord = useCallback((chapter: number, verse: number, word: QuranWord) => {
    if (
      selectedLocation?.chapter === chapter &&
      selectedLocation?.verse === verse &&
      selectedLocation?.position === word.position
    ) {
      setSelectedWord(null);
      setSelectedLocation(null);
    } else {
      setSelectedWord(word);
      setSelectedLocation({ chapter, verse, position: word.position });
    }
  }, [selectedLocation]);

  const clearSelection = useCallback(() => {
    setSelectedWord(null);
    setSelectedLocation(null);
  }, []);

  const navigateWord = useCallback((direction: 'prev' | 'next') => {
    if (currentWordIndex < 0) return;
    const newIndex = direction === 'next' ? currentWordIndex + 1 : currentWordIndex - 1;
    if (newIndex < 0 || newIndex >= flatWords.length) return;
    const target = flatWords[newIndex];
    setSelectedWord(target.word);
    setSelectedLocation({ chapter: target.chapter, verse: target.verse, position: target.word.position });
    // Auto-scroll to keep the highlighted word visible
    if (target.element) {
      target.element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, [currentWordIndex, flatWords]);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedWord) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape') {
        clearSelection();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateWord('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateWord('next');
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedWord, clearSelection, navigateWord]);

  return (
    <WordDictionaryContext.Provider value={{
      selectedWord,
      selectedLocation,
      currentWordIndex,
      totalWords: flatWords.length,
      canGoNext,
      canGoPrev,
      isOpen: selectedWord !== null,
      selectWord,
      navigateWord,
      clearSelection,
      registerWords,
      unregisterWords,
    }}>
      {children}
    </WordDictionaryContext.Provider>
  );
}
