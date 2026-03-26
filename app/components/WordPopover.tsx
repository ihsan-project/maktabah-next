'use client';

import React, { useEffect, useState } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
  FloatingPortal,
} from '@floating-ui/react';
import { QuranWord, SurahWordData } from '@/types';
import { loadRootsIndex, RootOccurrence } from '@/lib/roots';

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

/** Surah names for displaying cross-references */
const SURAH_NAMES = [
  '', 'Al-Fatiha', 'Al-Baqarah', 'Aal-E-Imran', 'An-Nisa', 'Al-Maida',
  'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus', 'Hud', 'Yusuf',
  'Ar-Ra\'d', 'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf',
  'Maryam', 'Ta-Ha', 'Al-Anbiya', 'Al-Hajj', 'Al-Mu\'minun', 'An-Nur',
  'Al-Furqan', 'Ash-Shu\'ara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut',
  'Ar-Rum', 'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin',
  'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shura',
  'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah', 'Al-Ahqaf', 'Muhammad',
  'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm',
  'Al-Qamar', 'Ar-Rahman', 'Al-Waqiah', 'Al-Hadid', 'Al-Mujadila',
  'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', 'Al-Jumuah', 'Al-Munafiqun',
  'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam',
  'Al-Haqqah', 'Al-Ma\'arij', 'Nuh', 'Al-Jinn', 'Al-Muzzammil',
  'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba',
  'An-Nazi\'at', 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-A\'la', 'Al-Ghashiyah',
  'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh',
  'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah',
  'Al-Adiyat', 'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah',
  'Al-Fil', 'Quraysh', 'Al-Ma\'un', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

interface CrossRefVerse {
  surah: number;
  verse: number;
  word: string;        // the Arabic word from this root in this verse
  translation: string; // its translation
}

/** In-memory cache for surah word data used by cross-references */
const wordDataCache = new Map<number, SurahWordData>();

async function fetchWordData(surah: number): Promise<SurahWordData | null> {
  if (wordDataCache.has(surah)) return wordDataCache.get(surah)!;
  try {
    const res = await fetch(`/quran/words/${surah}.json`);
    if (!res.ok) return null;
    const data: SurahWordData = await res.json();
    wordDataCache.set(surah, data);
    return data;
  } catch {
    return null;
  }
}

/** Pick up to `count` diverse sample occurrences (spread across different surahs) */
function pickSamples(occurrences: RootOccurrence[], currentSurah: number, currentVerse: number, count: number): RootOccurrence[] {
  // Filter out the current verse, then pick samples from different surahs
  const filtered = occurrences.filter((o) => !(o.s === currentSurah && o.v === currentVerse));
  if (filtered.length <= count) return filtered;

  // Try to pick from different surahs for diversity
  const bySurah = new Map<number, RootOccurrence[]>();
  for (const o of filtered) {
    if (!bySurah.has(o.s)) bySurah.set(o.s, []);
    bySurah.get(o.s)!.push(o);
  }

  const samples: RootOccurrence[] = [];
  const surahKeys = Array.from(bySurah.keys());
  let i = 0;
  while (samples.length < count && i < surahKeys.length) {
    const surahOccs = bySurah.get(surahKeys[i])!;
    samples.push(surahOccs[0]);
    i++;
  }
  return samples;
}

interface WordPopoverProps {
  word: QuranWord;
  anchorEl: HTMLElement | null;
  currentSurah: number;
  currentVerse: number;
  onClose: () => void;
}

export default function WordPopover({ word, anchorEl, currentSurah, currentVerse, onClose }: WordPopoverProps) {
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 12 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  const [rootCount, setRootCount] = useState<number | null>(null);
  const [crossRefs, setCrossRefs] = useState<CrossRefVerse[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  // Load root cross-references
  useEffect(() => {
    if (!word.root) return;
    let cancelled = false;
    setLoadingRefs(true);

    loadRootsIndex().then(async (index) => {
      if (cancelled || !index) { setLoadingRefs(false); return; }
      const entry = index[word.root!];
      if (!entry) { setLoadingRefs(false); return; }

      setRootCount(entry.occurrences);

      // Pick sample verses and load their word data
      const samples = pickSamples(entry.verses, currentSurah, currentVerse, 4);
      const refs: CrossRefVerse[] = [];

      for (const occ of samples) {
        const data = await fetchWordData(occ.s);
        if (cancelled) return;
        const verseWords = data?.verses?.[String(occ.v)]?.words;
        const matchedWord = verseWords?.find((w) => w.position === occ.p);
        if (matchedWord) {
          refs.push({
            surah: occ.s,
            verse: occ.v,
            word: matchedWord.text_uthmani,
            translation: matchedWord.translation,
          });
        }
      }

      if (!cancelled) {
        setCrossRefs(refs);
        setLoadingRefs(false);
      }
    });

    return () => { cancelled = true; };
  }, [word.root, currentSurah, currentVerse]);

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

  // Deduplicate verses for the "unique verses" count
  const uniqueVerseCount = rootCount !== null
    ? (() => {
        // rootCount is total word occurrences; we show it as-is since
        // the roots.json already tracks per-word occurrences
        return rootCount;
      })()
    : null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 word-popover-enter max-h-[70vh] overflow-y-auto"
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

        {/* Root Cross-References */}
        {word.root && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Root Exploration
              </h4>
              {uniqueVerseCount !== null && (
                <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                  {uniqueVerseCount.toLocaleString()} occurrences
                </span>
              )}
            </div>

            {loadingRefs && crossRefs.length === 0 && (
              <p className="text-xs text-gray-400 italic">Loading cross-references...</p>
            )}

            {crossRefs.length > 0 && (
              <div className="space-y-1.5">
                {crossRefs.map((ref) => (
                  <a
                    key={`${ref.surah}:${ref.verse}`}
                    href={`/quran?start=${ref.surah}:${Math.max(1, ref.verse - 3)}&end=${ref.surah}:${ref.verse + 3}`}
                    className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-gray-400 font-mono shrink-0">
                      {ref.surah}:{ref.verse}
                    </span>
                    <span dir="rtl" lang="ar" className="font-arabic text-sm text-gray-700 shrink-0">
                      {ref.word}
                    </span>
                    <span className="text-gray-500 truncate">
                      {ref.translation}
                    </span>
                    <span className="text-[10px] text-gray-300 ml-auto shrink-0 hidden group-hover:inline">
                      {SURAH_NAMES[ref.surah] || ''}
                    </span>
                  </a>
                ))}
              </div>
            )}

            {uniqueVerseCount !== null && uniqueVerseCount > 4 && (
              <a
                href={`/search?q=${encodeURIComponent(word.root!)}&titles=quran`}
                className="block text-center text-xs text-primary hover:text-primary-dark font-medium mt-2 py-1 rounded hover:bg-primary/5 transition-colors"
              >
                See all verses with this root &rarr;
              </a>
            )}
          </div>
        )}
      </div>
    </FloatingPortal>
  );
}
