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

/** Build a sorted flat list from groups on demand (no state needed) */
function buildFlatList(groups: RegisteredGroup[]): RegisteredWord[] {
  const sorted = [...groups].sort((a, b) => {
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
  return flat;
}

function findWordIndex(flat: RegisteredWord[], loc: WordLocation | null): number {
  if (!loc) return -1;
  return flat.findIndex(w =>
    w.chapter === loc.chapter &&
    w.verse === loc.verse &&
    w.word.position === loc.position
  );
}

export function WordDictionaryProvider({ children }: { children: React.ReactNode }) {
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WordLocation | null>(null);
  const groupsRef = useRef<RegisteredGroup[]>([]);
  // Bump this to force re-render when groups change
  const [, setGroupVersion] = useState(0);

  const registerWords = useCallback((id: string, chapter: number, verse: number, words: QuranWord[], elements: Map<number, HTMLElement>) => {
    const existing = groupsRef.current.findIndex(g => g.id === id);
    if (existing >= 0) {
      groupsRef.current[existing] = { id, chapter, verse, words, elements };
    } else {
      groupsRef.current.push({ id, chapter, verse, words, elements });
    }
    setGroupVersion(v => v + 1);
  }, []);

  const unregisterWords = useCallback((id: string) => {
    groupsRef.current = groupsRef.current.filter(g => g.id !== id);
    setGroupVersion(v => v + 1);
  }, []);

  // Compute navigation state from ref directly (always fresh)
  const flatWords = buildFlatList(groupsRef.current);
  const currentWordIndex = findWordIndex(flatWords, selectedLocation);
  const canGoPrev = currentWordIndex > 0;
  const canGoNext = currentWordIndex >= 0 && currentWordIndex < flatWords.length - 1;

  const selectWord = useCallback((chapter: number, verse: number, word: QuranWord) => {
    setSelectedLocation(prev => {
      if (prev?.chapter === chapter && prev?.verse === verse && prev?.position === word.position) {
        setSelectedWord(null);
        return null;
      }
      setSelectedWord(word);
      return { chapter, verse, position: word.position };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWord(null);
    setSelectedLocation(null);
  }, []);

  const navigateWord = useCallback((direction: 'prev' | 'next') => {
    setSelectedLocation(prev => {
      const flat = buildFlatList(groupsRef.current);
      const idx = findWordIndex(flat, prev);
      if (idx < 0) return prev;
      const newIndex = direction === 'next' ? idx + 1 : idx - 1;
      if (newIndex < 0 || newIndex >= flat.length) return prev;
      const target = flat[newIndex];
      setSelectedWord(target.word);
      if (target.element) {
        target.element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      return { chapter: target.chapter, verse: target.verse, position: target.word.position };
    });
  }, []);

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
