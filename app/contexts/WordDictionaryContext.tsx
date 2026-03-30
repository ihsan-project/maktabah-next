'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { QuranWord } from '@/types';

export interface WordLocation {
  chapter: number;
  verse: number;
  position: number;
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

/** Find the group matching a location and the word's index within it */
function findInGroup(groups: RegisteredGroup[], loc: WordLocation | null): { group: RegisteredGroup; index: number } | null {
  if (!loc) return null;
  const group = groups.find(g => g.chapter === loc.chapter && g.verse === loc.verse);
  if (!group) return null;
  const index = group.words.findIndex(w => w.position === loc.position);
  if (index < 0) return null;
  return { group, index };
}

export function WordDictionaryProvider({ children }: { children: React.ReactNode }) {
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WordLocation | null>(null);
  const groupsRef = useRef<RegisteredGroup[]>([]);
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

  // Navigation scoped to the current verse
  const match = findInGroup(groupsRef.current, selectedLocation);
  const canGoPrev = match !== null && match.index > 0;
  const canGoNext = match !== null && match.index < match.group.words.length - 1;

  const selectWord = useCallback((chapter: number, verse: number, word: QuranWord) => {
    setSelectedLocation(prev => {
      if (prev?.chapter === chapter && prev?.verse === verse && prev?.position === word.position) {
        setSelectedWord(null);
        return null;
      }
      setSelectedWord(word);
      // After layout reflows (mobile goes from normal flow to fixed split),
      // scroll the active word into view in the new scroll container
      requestAnimationFrame(() => {
        const group = groupsRef.current.find(g => g.chapter === chapter && g.verse === verse);
        const el = group?.elements.get(word.position);
        if (el) {
          el.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
      });
      return { chapter, verse, position: word.position };
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedWord(null);
    setSelectedLocation(null);
  }, []);

  const navigateWord = useCallback((direction: 'prev' | 'next') => {
    setSelectedLocation(prev => {
      const result = findInGroup(groupsRef.current, prev);
      if (!result) return prev;
      const { group, index } = result;
      const newIndex = direction === 'next' ? index + 1 : index - 1;
      if (newIndex < 0 || newIndex >= group.words.length) return prev;
      const target = group.words[newIndex];
      setSelectedWord(target);
      const el = group.elements.get(target.position);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
      return { chapter: group.chapter, verse: group.verse, position: target.position };
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
