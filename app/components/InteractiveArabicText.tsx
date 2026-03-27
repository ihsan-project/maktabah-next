'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QuranWord, SurahWordData } from '@/types';
import ArabicText from './ArabicText';
import WordPopover from './WordPopover';

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
}

export default function InteractiveArabicText({
  chapter,
  verse,
  uthmaniText,
  className = '',
}: InteractiveArabicTextProps) {
  const [words, setWords] = useState<QuranWord[] | null>(null);
  const [selectedWord, setSelectedWord] = useState<QuranWord | null>(null);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadSurahWords(chapter).then((data) => {
      if (cancelled) return;
      const verseData = data?.verses?.[String(verse)];
      setWords(verseData?.words ?? null);
    });
    return () => { cancelled = true; };
  }, [chapter, verse]);

  const handleWordClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>, word: QuranWord) => {
      e.stopPropagation();
      // If clicking the same word, toggle off
      if (selectedWord?.position === word.position) {
        setSelectedWord(null);
        setAnchorEl(null);
      } else {
        setSelectedWord(word);
        setAnchorEl(e.currentTarget);
      }
    },
    [selectedWord],
  );

  const handleClose = useCallback(() => {
    setSelectedWord(null);
    setAnchorEl(null);
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
                className={`interactive-word ${
                  selectedWord?.position === word.position
                    ? 'interactive-word-active'
                    : ''
                }`}
                onClick={(e) => handleWordClick(e, word)}
              >
                {word.text_uthmani}
              </span>
            </React.Fragment>
          ))}
        </bdi>
      </p>

      {selectedWord && anchorEl && (
        <WordPopover
          word={selectedWord}
          anchorEl={anchorEl}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
