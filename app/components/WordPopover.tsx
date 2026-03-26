'use client';

import React, { useEffect } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from '@floating-ui/react';
import { QuranWord } from '@/types';

/** Decode the short POS code into a readable label */
function decodePos(pos: string | null): string {
  if (!pos) return 'Particle';
  const map: Record<string, string> = {
    N: 'Noun',
    V: 'Verb',
    PN: 'Proper Noun',
    ADJ: 'Adjective',
    ADV: 'Adverb',
    PRON: 'Pronoun',
    DEM: 'Demonstrative',
    REL: 'Relative Pronoun',
    CONJ: 'Conjunction',
    P: 'Preposition',
    NEG: 'Negative Particle',
    INTG: 'Interrogative',
    COND: 'Conditional',
    T: 'Time Adverb',
    LOC: 'Location Adverb',
    INL: 'Initials',
  };
  return map[pos] || pos;
}

/** Extract verb form (I–X) from morphology string if present */
function extractVerbForm(morphology: string): string | null {
  const match = morphology.match(/VF:(\d+)/);
  if (!match) return null;
  const forms: Record<string, string> = {
    '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V',
    '6': 'VI', '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X',
  };
  return forms[match[1]] || null;
}

interface WordPopoverProps {
  word: QuranWord;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export default function WordPopover({ word, anchorEl, onClose }: WordPopoverProps) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const floating = refs.floating.current;
      if (
        floating &&
        !floating.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    // Delay to avoid catching the triggering click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, anchorEl, refs.floating]);

  const verbForm = extractVerbForm(word.morphology);

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-72 word-popover-enter"
        dir="ltr"
      >
        {/* Arabic word — large display */}
        <div className="text-center mb-3">
          <p
            dir="rtl"
            lang="ar"
            className="font-arabic text-3xl leading-relaxed text-gray-900"
          >
            {word.text_uthmani}
          </p>
          <p className="text-sm text-gray-500 mt-0.5 italic">
            {word.transliteration}
          </p>
        </div>

        {/* Translation */}
        <div className="bg-primary/5 rounded-md px-3 py-2 mb-3">
          <p className="text-sm font-medium text-primary-dark">
            {word.translation}
          </p>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
          {/* Root */}
          {word.root && (
            <>
              <span className="text-gray-400 font-medium">Root</span>
              <span dir="rtl" lang="ar" className="font-arabic text-sm text-gray-700">
                {word.root}
              </span>
            </>
          )}

          {/* Lemma */}
          <span className="text-gray-400 font-medium">Lemma</span>
          <span dir="rtl" lang="ar" className="font-arabic text-sm text-gray-700">
            {word.lemma}
          </span>

          {/* Part of speech */}
          <span className="text-gray-400 font-medium">Type</span>
          <span className="text-gray-700">{decodePos(word.pos)}</span>

          {/* Verb form */}
          {verbForm && (
            <>
              <span className="text-gray-400 font-medium">Verb Form</span>
              <span className="text-gray-700">Form {verbForm}</span>
            </>
          )}
        </div>
      </div>
    </FloatingPortal>
  );
}
