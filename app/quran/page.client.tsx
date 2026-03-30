'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import TranslationCarousel from '@/app/components/TranslationCarousel';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider, useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';
import {
  parseVerseRef,
  fetchSurahData,
  fetchQuranMetadata,
  DEFAULT_START,
  DEFAULT_END,
  type VerseRef,
  type QuranVerse,
  type QuranMetadata,
  type SurahData,
  getBookIdForAuthor,
} from '@/lib/quran-utils';

const VERSES_PER_PAGE = 20;

function QuranContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const dictCtx = useWordDictionaryOptional();
  const isDrawerOpen = dictCtx?.isOpen ?? false;

  // Parse range from URL
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');
  const pageParam = searchParams.get('page');
  const highlightTerm = searchParams.get('highlight') || undefined;
  const startRef = startParam ? parseVerseRef(startParam) : null;
  const endRef = endParam ? parseVerseRef(endParam) : null;
  const start = startRef || DEFAULT_START;
  const end = endRef || DEFAULT_END;
  const currentPage = pageParam ? Math.max(1, parseInt(pageParam, 10)) : 1;

  // State
  const [metadata, setMetadata] = useState<QuranMetadata | null>(null);
  const [allVerses, setAllVerses] = useState<QuranVerse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTranslators, setSelectedTranslators] = useState<string[]>([]);

  // Track loaded surahs cache
  const loadedSurahsRef = useRef<Map<number, SurahData>>(new Map());

  // Surah selector state
  const [surahInput, setSurahInput] = useState(startParam || `${start.surah}:${start.verse}`);
  const [endInput, setEndInput] = useState(endParam || `${end.surah}:${end.verse}`);

  // Load metadata on mount
  useEffect(() => {
    fetchQuranMetadata()
      .then(setMetadata)
      .catch(() => setError('Failed to load Quran metadata'));
  }, []);

  // Extract translators from metadata
  const availableTranslators = useMemo(() => {
    return metadata?.translators || [];
  }, [metadata]);

  /**
   * Load ALL verses in the range. We fetch surah JSONs as needed
   * but only build the flat verse list once per range change.
   */
  const loadAllVerses = useCallback(async () => {
    if (!metadata) return;

    const verses: QuranVerse[] = [];
    let current: VerseRef = { surah: start.surah, verse: start.verse };

    while (true) {
      if (current.surah > end.surah || (current.surah === end.surah && current.verse > end.verse)) break;
      if (current.surah > 114) break;

      let surahData = loadedSurahsRef.current.get(current.surah);
      if (!surahData) {
        surahData = await fetchSurahData(current.surah);
        loadedSurahsRef.current.set(current.surah, surahData);
      }

      const maxVerse = current.surah === end.surah
        ? Math.min(end.verse, surahData.verseCount)
        : surahData.verseCount;

      while (current.verse <= maxVerse) {
        const verseData = surahData.verses[String(current.verse)];
        if (verseData) {
          verses.push({
            surah: current.surah,
            verse: current.verse,
            surahName: surahData.name,
            arabic: verseData.arabic,
            translations: verseData.translations,
          });
        }
        current.verse++;
      }

      if (current.surah >= end.surah) break;
      current.surah++;
      current.verse = 1;
    }

    return verses;
  }, [metadata, start.surah, start.verse, end.surah, end.verse]);

  // Load verses when metadata or range changes
  useEffect(() => {
    if (!metadata) return;

    loadedSurahsRef.current = new Map();
    setLoading(true);
    setError(null);

    loadAllVerses().then(verses => {
      setAllVerses(verses || []);
      setLoading(false);
    }).catch(() => {
      setError('Failed to load verses');
      setLoading(false);
    });
  }, [metadata, loadAllVerses]);

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(allVerses.length / VERSES_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * VERSES_PER_PAGE;
  const pageEnd = Math.min(pageStart + VERSES_PER_PAGE, allVerses.length);
  const displayedVerses = allVerses.slice(pageStart, pageEnd);

  // Navigate to a page
  const goToPage = useCallback((page: number) => {
    const params = new URLSearchParams();
    params.set('start', `${start.surah}:${start.verse}`);
    params.set('end', `${end.surah}:${end.verse}`);
    if (page > 1) params.set('page', String(page));
    router.push(`/quran?${params.toString()}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [router, start, end]);

  // Handle navigation to a new range
  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    const newStart = parseVerseRef(surahInput.trim());
    const newEnd = parseVerseRef(endInput.trim());
    if (!newStart || !newEnd) return;
    router.push(`/quran?start=${newStart.surah}:${newStart.verse}&end=${newEnd.surah}:${newEnd.verse}`);
  };

  const handleTranslatorSelectionChange = useCallback((selected: string[]) => {
    setSelectedTranslators(selected);
  }, []);

  if (error) {
    return <div className="text-center py-12 text-red-500">{error}</div>;
  }

  return (
    <div className="flex dict:gap-3">
      {/* Reading pane */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Range selector */}
        <form onSubmit={handleNavigate} className="mb-6 bg-white rounded-lg shadow-md p-4">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Verse Range:</label>
            <div className="flex items-center gap-2 flex-1">
              <input
                type="text"
                value={surahInput}
                onChange={e => setSurahInput(e.target.value)}
                placeholder="1:1"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <span className="text-gray-500">to</span>
              <input
                type="text"
                value={endInput}
                onChange={e => setEndInput(e.target.value)}
                placeholder="1:7"
                className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary-dark transition-colors"
              >
                Go
              </button>
            </div>
          </div>
          {metadata && (
            <div className="mt-2 text-xs text-gray-500">
              Format: surah:verse (e.g., 2:255 for Ayat al-Kursi). Range: 1:1 to 114:6.
            </div>
          )}
        </form>

        {/* Quick surah links */}
        {metadata && (
          <div className="mb-6 bg-white rounded-lg shadow-md p-4">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary hover:text-primary-dark">
                Browse by Surah
              </summary>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
                {metadata.surahs.map(s => (
                  <button
                    key={s.index}
                    onClick={() => {
                      const newStart = `${s.index}:1`;
                      const newEnd = `${s.index}:${s.verseCount}`;
                      setSurahInput(newStart);
                      setEndInput(newEnd);
                      router.push(`/quran?start=${newStart}&end=${newEnd}`);
                    }}
                    className="text-left px-2 py-1 text-xs rounded hover:bg-gray-100 transition-colors truncate"
                    title={`${s.index}. ${s.name} (${s.verseCount} verses)`}
                  >
                    <span className="text-gray-400 mr-1">{s.index}.</span>
                    {s.name}
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Translator selector */}
        <TranslatorSelector
          availableTranslators={availableTranslators}
          onSelectionChange={handleTranslatorSelectionChange}
        />

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-gray-500">Loading verses...</div>
        )}

        {/* Verses */}
        {!loading && displayedVerses.length > 0 && (
          <>
            {/* Page info */}
            <div className="mb-4 text-sm text-gray-500 text-center">
              Verses {pageStart + 1}–{pageEnd} of {allVerses.length}
              {totalPages > 1 && ` · Page ${safePage} of ${totalPages}`}
            </div>

            <div className="space-y-2">
              {displayedVerses.map(verse => {
                const filteredTranslations = verse.translations.filter(t =>
                  selectedTranslators.includes(t.author)
                );

                return (
                  <div key={`${verse.surah}:${verse.verse}`} className="mb-2">
                    {verse.arabic && (
                      <div className="px-4 pt-4 pb-2">
                        <InteractiveArabicText
                          chapter={verse.surah}
                          verse={verse.verse}
                          uthmaniText={verse.arabic}
                          className="text-gray-800 text-center"
                          useDrawer
                        />
                      </div>
                    )}
                    <TranslationCarousel
                      translations={filteredTranslations}
                      verseRef={`${verse.surah}:${verse.verse}`}
                      chapterName={verse.surahName}
                      buildTanzilUrl={(author: string) => `https://tanzil.net/#trans/${getBookIdForAuthor(author)}/${verse.surah}:${verse.verse}`}
                      onTanzilClick={() => {}}
                      highlightTerm={highlightTerm}
                    />
                  </div>
                );
              })}
            </div>

            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => goToPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <FiChevronLeft size={18} />
                </button>

                {generatePageNumbers(safePage, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-gray-400">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                        p === safePage
                          ? 'bg-primary text-white shadow-md'
                          : 'border border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  onClick={() => goToPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <FiChevronRight size={18} />
                </button>
              </div>
            )}

            {/* Attribution */}
            <div className="mt-6 text-center">
              <p className="text-xs text-gray-400">
                Quran text courtesy of{' '}
                <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="underline">
                  Tanzil.net
                </a>
              </p>
            </div>
          </>
        )}

        {/* No verses found */}
        {!loading && displayedVerses.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No verses found for this range. Check your start and end references.
          </div>
        )}
      </div>

      {/* Desktop drawer (hidden below dict breakpoint) */}
      <WordDrawer className="hidden dict:flex" />

      {/* Mobile bottom sheet (hidden above dict breakpoint) */}
      <WordBottomSheet className="dict:hidden" />
    </div>
  );
}

export default function QuranClient() {
  return (
    <WordDictionaryProvider>
      <QuranContent />
    </WordDictionaryProvider>
  );
}

/**
 * Generate page numbers with ellipsis for large ranges.
 * Shows: first, last, current, and 1 neighbor on each side.
 */
function generatePageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  pages.add(1);
  pages.add(total);
  for (let i = Math.max(1, current - 1); i <= Math.min(total, current + 1); i++) {
    pages.add(i);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('...');
    }
    result.push(sorted[i]);
  }
  return result;
}
