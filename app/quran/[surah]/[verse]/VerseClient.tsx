'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import ArabicText from '@/app/components/ArabicText';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import VerseTranslations from '@/app/components/VerseTranslations';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider, useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';
import type { QuranVerse } from '@/lib/quran-utils';

type Ref = { surah: number; verse: number } | null;

interface Props {
  focal: QuranVerse;
  context: QuranVerse[];
  prev: Ref;
  next: Ref;
  allAuthors: string[];
}

export default function VerseClient(props: Props) {
  return (
    <WordDictionaryProvider>
      <VerseLayout {...props} />
    </WordDictionaryProvider>
  );
}

function VerseLayout({ focal, context, prev, next, allAuthors }: Props) {
  const dictCtx = useWordDictionaryOptional();
  const isDrawerOpen = dictCtx?.isOpen ?? false;

  // Initialize to all authors so SSR + first client render show every translation (SEO).
  const [selected, setSelected] = useState<string[]>(allAuthors);
  const onChange = useCallback((s: string[]) => setSelected(s), []);

  const before = context.filter((c) => c.verse < focal.verse);
  const after = context.filter((c) => c.verse > focal.verse);
  const defaultTranslation = (v: QuranVerse) =>
    v.translations.find((t) => t.author === 'Saheeh International')?.text || v.translations[0]?.text;

  return (
    <div
      className={`flex dict:flex-row dict:gap-3 ${
        isDrawerOpen
          ? 'flex-col fixed inset-0 z-40 bg-[rgb(var(--background-rgb))] dict:relative dict:inset-auto dict:z-auto dict:bg-transparent'
          : ''
      }`}
    >
      {/* Reading pane */}
      <div className={`flex-1 min-w-0 overflow-hidden ${isDrawerOpen ? 'overflow-y-auto p-4 dict:p-0' : ''}`}>
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/quran" className="hover:underline">Quran</Link> ›{' '}
          <Link href={`/quran/${focal.surah}`} className="hover:underline">{focal.surahName}</Link> › Verse {focal.verse}
        </nav>
        <h1 className="text-2xl font-bold text-center text-primary mb-6">
          {focal.surahName} {focal.surah}:{focal.verse}
        </h1>

        {before.map((c) => (
          <ContextVerse key={c.verse} surah={c.surah} verse={c.verse} arabic={c.arabic} translation={defaultTranslation(c)} />
        ))}

        {/* Focal verse — interactive + all translations */}
        <div className="my-6 ring-2 ring-primary/20 rounded-lg p-2" id={`v${focal.verse}`}>
          <div className="px-4 pt-2 pb-4">
            <InteractiveArabicText
              chapter={focal.surah}
              verse={focal.verse}
              uthmaniText={focal.arabic}
              className="text-gray-800 text-center"
              useDrawer
            />
          </div>
          <TranslatorSelector availableTranslators={allAuthors} onSelectionChange={onChange} />
          <VerseTranslations
            translations={focal.translations}
            verseRef={`${focal.surah}:${focal.verse}`}
            selectedAuthors={selected}
          />
        </div>

        {after.map((c) => (
          <ContextVerse key={c.verse} surah={c.surah} verse={c.verse} arabic={c.arabic} translation={defaultTranslation(c)} />
        ))}

        <div className="mt-8 flex justify-between text-sm">
          {prev ? (
            <Link href={`/quran/${prev.surah}/${prev.verse}`} className="text-primary hover:underline">← {prev.surah}:{prev.verse}</Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/quran/${next.surah}/${next.verse}`} className="text-primary hover:underline">{next.surah}:{next.verse} →</Link>
          ) : (
            <span />
          )}
        </div>
      </div>

      {/* Desktop drawer (right side, hidden below dict breakpoint) */}
      <WordDrawer className="hidden dict:flex" />

      {/* Mobile bottom sheet (hidden above dict breakpoint) */}
      <WordBottomSheet className="dict:hidden" />
    </div>
  );
}

function ContextVerse({ surah, verse, arabic, translation }: { surah: number; verse: number; arabic: string; translation?: string }) {
  return (
    <Link href={`/quran/${surah}/${verse}`} className="block opacity-50 hover:opacity-80 transition-opacity py-2">
      <ArabicText size="base" className="text-gray-700 text-center">{arabic}</ArabicText>
      {translation && <p className="text-xs text-gray-500 mt-1">{surah}:{verse} — {translation}</p>}
    </Link>
  );
}
