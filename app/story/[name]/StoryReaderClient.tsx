'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import { FiBookOpen } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from '@/app/components/AuthProvider';
import TranslatorSelector from '@/app/components/TranslatorSelector';
import TranslationCarousel from '@/app/components/TranslationCarousel';
import InteractiveArabicText from '@/app/components/InteractiveArabicText';
import WordDrawer from '@/app/components/WordDrawer';
import WordBottomSheet from '@/app/components/WordBottomSheet';
import { WordDictionaryProvider, useWordDictionaryOptional } from '@/app/contexts/WordDictionaryContext';
import { buildContextUrl, getBookIdForAuthor, isQuranBookId } from '@/lib/quran-utils';
import type { StoryPageVerse } from '@/lib/story-data';

interface Props {
  name: string;
  verses: StoryPageVerse[];
  defaultTranslator: string;
}

function StoryContent({ name, verses, defaultTranslator }: Props) {
  const { user, loading } = useAuth();
  const dictCtx = useWordDictionaryOptional();
  const isDrawerOpen = dictCtx?.isOpen ?? false;

  // Initialize to the default translator so SSR + first client render show one
  // translation per verse (matches the server output, avoids hydration mismatch).
  const [selected, setSelected] = useState<string[]>([defaultTranslator]);
  const onChange = useCallback((s: string[]) => setSelected(s), []);

  const availableTranslators = React.useMemo(() => {
    const set = new Set<string>();
    verses.forEach((v) => v.translations.forEach((t) => set.add(t.author)));
    return Array.from(set).sort();
  }, [verses]);

  // Stable identity keys; a curated story may quote the same verse twice
  // (e.g. "7:130" then "7:130#2"), so we disambiguate per page-occurrence.
  const versesWithKeys = React.useMemo(() => {
    const seen = new Map<string, number>();
    return verses.map((v) => {
      const ref = `${v.chapter}:${v.verse}`;
      const n = (seen.get(ref) ?? 0) + 1;
      seen.set(ref, n);
      return { verse: v, id: n === 1 ? ref : `${ref}#${n}` };
    });
  }, [verses]);

  const trackSignIn = (location: string) =>
    MixpanelTracking.track('Click Sign In', { source: 'story_page', story_name: name, location });

  return (
    <div className={`flex dict:flex-row dict:gap-3 ${isDrawerOpen ? 'flex-col fixed inset-0 z-40 bg-[rgb(var(--background-rgb))] dict:relative dict:inset-auto dict:z-auto dict:bg-transparent' : ''}`}>
      <div className={`flex-1 min-w-0 overflow-hidden ${isDrawerOpen ? 'overflow-y-auto p-4 dict:p-0' : ''}`}>
        {!user && !loading && (
          <div className="mb-8 p-6 bg-primary-light bg-opacity-10 rounded-lg text-center">
            <h2 className="text-xl font-semibold text-primary mb-2">Discover More Islamic Knowledge</h2>
            <p className="mb-4">Sign in to search the full collection of Islamic texts and create your own stories.</p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 py-3 px-6 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
              onClick={() => trackSignIn('top_banner')}
            >
              <FcGoogle className="text-xl" />
              <span>Sign in with Google</span>
            </Link>
          </div>
        )}

        <TranslatorSelector
          availableTranslators={availableTranslators}
          onSelectionChange={onChange}
          defaultSelection={[defaultTranslator]}
        />

        <div className="space-y-2">
          {versesWithKeys.map(({ verse, id }) => {
            const matched = verse.translations.filter((t) => selected.includes(t.author));
            const visible = matched.length > 0 ? matched : verse.translations.slice(0, 1);
            const isQuran = isQuranBookId(verse.bookId);
            return (
              <div key={id} className="mb-2">
                {verse.arabic && (
                  <div className="px-4 pt-4 pb-2">
                    <InteractiveArabicText
                      chapter={verse.chapter}
                      verse={verse.verse}
                      uthmaniText={verse.arabic}
                      className="text-gray-800 text-center"
                      useDrawer
                    />
                  </div>
                )}
                <TranslationCarousel
                  translations={visible}
                  verseRef={`${verse.chapter}:${verse.verse}`}
                  chapterName={verse.chapterName}
                  buildTanzilUrl={isQuran ? (author) => `https://tanzil.net/#trans/${getBookIdForAuthor(author)}/${verse.chapter}:${verse.verse}` : undefined}
                  onTanzilClick={isQuran ? (author) => MixpanelTracking.track('Tanzil Link Click', { chapter: verse.chapter, verse: verse.verse, author, source: 'story_page', story_name: name }) : undefined}
                />
                {isQuran && (
                  <div className="flex justify-end px-2">
                    <Link
                      href={buildContextUrl(verse.chapter, verse.verse)}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition-colors"
                      onClick={() => MixpanelTracking.track('Read in Context', { chapter: verse.chapter, verse: verse.verse, source: 'story_page', story_name: name })}
                    >
                      <FiBookOpen size={12} />
                      <span>Read section</span>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <WordDrawer className="hidden dict:flex" />
      <WordBottomSheet className="dict:hidden" />
    </div>
  );
}

export default function StoryReaderClient(props: Props) {
  return (
    <WordDictionaryProvider>
      <StoryContent {...props} />
    </WordDictionaryProvider>
  );
}
