'use client';

import React, { useState, useEffect, useRef, useCallback, useId } from 'react';
import { QuranWord, SurahWordData } from '@/types';
import ArabicText from './ArabicText';
import WordPopover from './WordPopover';
import { useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';

/** In-memory cache for loaded surah word data */
const surahCache = new Map<number, SurahWordData>();

async function loadSurahWords(chapter: number): Promise<SurahWordData | null> {
  if (surahCache.has(chapter)) return surahCache.get(chapter)!;
  try {
    const res = await fetch(`/quran/words/${chapter}.json`);
    if (!res.ok) return null;
    const data: SurahWordData = await res.json();
    surahCache.set(chapter, data);
    return data;
  } catch {
    return null;
  }
}

interface InteractiveArabicTextProps {
  chapter: number;
  verse: number;
  uthmaniText?: string;
  className?: string;
  useDrawer?: boolean;
}

export default function InteractiveArabicText({
  chapter,
  verse,
  uthmaniText,
  className = '',
  useDrawer = false,
}: InteractiveArabicTextProps) {
  const [words, setWords] = useState<QuranWord[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wordSpanRefs = useRef<Map<number, HTMLElement>>(new Map());
  const instanceId = useId();
  const groupId = `${instanceId}-${chapter}:${verse}`;

  // Context-based state (for drawer mode)
  const dictCtx = useWordDictionaryOptional();
  const usingDrawer = useDrawer && dictCtx !== null;

  // Self-contained state (for popover mode)
  const [localSelectedWord, setLocalSelectedWord] = useState<QuranWord | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setWords(null);
    setLocalSelectedWord(null);
    setAnchorEl(null);
    wordSpanRefs.current.clear();
    let cancelled = false;
    loadSurahWords(chapter).then((data) => {
      if (cancelled) return;
      const verseData = data?.verses?.[String(verse)];
      setWords(verseData?.words ?? null);
    });
    return () => { cancelled = true; };
  }, [chapter, verse]);

  // Register words with context when in drawer mode
  useEffect(() => {
    if (!usingDrawer || !words || !dictCtx) return;
    dictCtx.registerWords(groupId, chapter, verse, words, wordSpanRefs.current);
    return () => {
      dictCtx.unregisterWords(groupId);
    };
  }, [usingDrawer, words, dictCtx, groupId, chapter, verse]);

  const isWordActive = useCallback((word: QuranWord) => {
    if (usingDrawer && dictCtx) {
      return (
        dictCtx.selectedLocation?.chapter === chapter &&
        dictCtx.selectedLocation?.verse === verse &&
        dictCtx.selectedLocation?.position === word.position
      );
    }
    return localSelectedWord?.position === word.position;
  }, [usingDrawer, dictCtx, chapter, verse, localSelectedWord]);

  const handleWordClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: QuranWord) => {
      e.stopPropagation();
      if (usingDrawer && dictCtx) {
        dictCtx.selectWord(chapter, verse, word);
      } else {
        if (localSelectedWord?.position === word.position) {
          setLocalSelectedWord(null);
          setAnchorEl(null);
        } else {
          setLocalSelectedWord(word);
          setAnchorEl(e.currentTarget);
        }
      }
    },
    [usingDrawer, dictCtx, chapter, verse, localSelectedWord],
  );

  const handleWordKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>, word: QuranWord) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (usingDrawer && dictCtx) {
          dictCtx.selectWord(chapter, verse, word);
        } else {
          if (localSelectedWord?.position === word.position) {
            setLocalSelectedWord(null);
            setAnchorEl(null);
          } else {
            setLocalSelectedWord(word);
            setAnchorEl(e.currentTarget);
          }
        }
      }
    },
    [usingDrawer, dictCtx, chapter, verse, localSelectedWord],
  );

  const handleClose = useCallback(() => {
    setLocalSelectedWord(null);
    setAnchorEl(null);
  }, []);

  const setWordRef = useCallback((position: number, el: HTMLElement | null) => {
    if (el) {
      wordSpanRefs.current.set(position, el);
    } else {
      wordSpanRefs.current.delete(position);
    }
  }, []);

  // Fallback: render plain ArabicText while loading or if data unavailable
  if (!words) {
    if (!uthmaniText) return null;
    return (
      <ArabicText size="lg" className={className}>
        {uthmaniText}
      </ArabicText>
    );
  }

  return (
    <div ref={containerRef}>
      <p
        dir="rtl"
        lang="ar"
        className={`arabic-text font-arabic arabic-text-lg ${className}`}
      >
        <bdi>
          {words.map((word, i) => (
            <React.Fragment key={word.position}>
              {i > 0 && ' '}
              <span
                ref={(el) => setWordRef(word.position, el)}
                role="button"
                tabIndex={0}
                className={`interactive-word ${
                  isWordActive(word) ? 'interactive-word-active' : ''
                }`}
                onClick={(e) => handleWordClick(e, word)}
                onKeyDown={(e) => handleWordKeyDown(e, word)}
              >
                {word.text_uthmani}
              </span>
            </React.Fragment>
          ))}
        </bdi>
      </p>

      {/* Popover mode: render inline popover (for SearchResults) */}
      {!usingDrawer && localSelectedWord && anchorEl && (
        <WordPopover
          word={localSelectedWord}
          anchorEl={anchorEl}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
