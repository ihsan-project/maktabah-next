'use client';

import React, { useState, useEffect } from 'react';
import { TextWithLineBreaks } from '@/lib/highlight';
import type { Translation } from '@/lib/quran-utils';
import { getBookIdForAuthorOrNull } from '@/lib/quran-utils';

interface Props {
  translations: Translation[];
  verseRef: string;          // "2:255"
  selectedAuthors: string[]; // authors to keep visible
}

export default function VerseTranslations({ translations, verseRef, selectedAuthors }: Props) {
  const [highlight, setHighlight] = useState<string | undefined>(undefined);
  useEffect(() => {
    const h = new URLSearchParams(window.location.search).get('highlight');
    setHighlight(h || undefined);
  }, []);
  const [chapter, verse] = verseRef.split(':');
  return (
    <div className="space-y-3 mt-4">
      {translations.map((t) => {
        const hidden = !selectedAuthors.includes(t.author);
        const bookId = getBookIdForAuthorOrNull(t.author);
        return (
          <div key={t.author} className={`bg-white rounded-lg shadow-sm p-4 border border-gray-200 ${hidden ? 'hidden' : ''}`}>
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold text-primary text-sm">{t.author}</h4>
              {bookId && (
                <a
                  href={`https://tanzil.net/#trans/${bookId}/${chapter}:${verse}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >tanzil.net</a>
              )}
            </div>
            <div className={`text-gray-700 text-sm leading-relaxed${highlight ? ' quran-highlight' : ''}`}>
              <TextWithLineBreaks text={t.text} highlightTerm={highlight} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
