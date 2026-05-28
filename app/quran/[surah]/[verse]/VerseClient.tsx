'use client';

import React, { useState, useCallback } from 'react';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import VerseTranslations from '@/app/components/VerseTranslations';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider } from '@/app/contexts/WordDictionaryContext';
import type { QuranVerse } from '@/lib/quran-utils';

interface Props {
  focal: QuranVerse;
  allAuthors: string[];
}

export default function VerseClient({ focal, allAuthors }: Props) {
  // Initialize to all authors so SSR + first client render show every translation (SEO).
  const [selected, setSelected] = useState<string[]>(allAuthors);
  const onChange = useCallback((s: string[]) => setSelected(s), []);

  return (
    <WordDictionaryProvider>
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
      <WordDrawer className="hidden dict:flex" />
      <WordBottomSheet className="dict:hidden" />
    </WordDictionaryProvider>
  );
}
