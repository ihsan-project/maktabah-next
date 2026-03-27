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

/** A unique derived form from a root, with example verse */
interface DerivedForm {
  lemma: string;           // base form (Arabic)
  translation: string;     // English meaning
  pos: string;             // decoded POS label
  verbForm: string | null; // Form I-X if verb
  count: number;           // how many times this form appears
  exampleSurah: number;
  exampleVerse: number;
}

/** Group derived forms by POS category for display */
interface FormGroup {
  label: string;    // "Nouns", "Verbs", etc.
  forms: DerivedForm[];
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

/** POS category for grouping */
function posCategory(pos: string | null): string {
  if (!pos) return 'Particles';
  const categories: Record<string, string> = {
    N: 'Nouns', PN: 'Nouns', ADJ: 'Adjectives',
    V: 'Verbs',
    PRON: 'Pronouns', DEM: 'Pronouns', REL: 'Pronouns',
    ADV: 'Particles', CONJ: 'Particles', P: 'Particles',
    NEG: 'Particles', INTG: 'Particles', COND: 'Particles',
    T: 'Particles', LOC: 'Particles', INL: 'Other',
  };
  return categories[pos] || 'Other';
}

/** Category display order */
const CATEGORY_ORDER = ['Verbs', 'Nouns', 'Adjectives', 'Pronouns', 'Particles', 'Other'];

/**
 * Collect unique derived forms from a sample of occurrences.
 * Samples up to `maxSurahs` different surahs to get diverse forms without loading all data.
 */
async function collectDerivedForms(
  occurrences: RootOccurrence[],
  maxSurahs: number,
): Promise<DerivedForm[]> {
  // Group occurrences by surah, pick a spread of surahs
  const bySurah = new Map<number, RootOccurrence[]>();
  for (const o of occurrences) {
    if (!bySurah.has(o.s)) bySurah.set(o.s, []);
    bySurah.get(o.s)!.push(o);
  }
  const surahKeys = Array.from(bySurah.keys());
  const sampled = surahKeys.length <= maxSurahs
    ? surahKeys
    : surahKeys.filter((_, i) => i % Math.ceil(surahKeys.length / maxSurahs) === 0).slice(0, maxSurahs);

  // Deduplicate by lemma
  const byLemma = new Map<string, { word: QuranWord; count: number; surah: number; verse: number }>();

  for (const s of sampled) {
    const data = await fetchWordData(s);
    if (!data) continue;
    for (const occ of bySurah.get(s)!) {
      const verseWords = data.verses?.[String(occ.v)]?.words;
      const w = verseWords?.find((x) => x.position === occ.p);
      if (!w || !w.lemma) continue;
      const existing = byLemma.get(w.lemma);
      if (existing) {
        existing.count++;
      } else {
        byLemma.set(w.lemma, { word: w, count: 1, surah: occ.s, verse: occ.v });
      }
    }
  }

  return Array.from(byLemma.values()).map(({ word, count, surah, verse }) => ({
    lemma: word.lemma,
    translation: word.translation,
    pos: decodePos(word.pos),
    verbForm: extractVerbForm(word.morphology),
    count,
    exampleSurah: surah,
    exampleVerse: verse,
  }));
}

/** Group derived forms by POS category and sort */
function groupByCategory(forms: DerivedForm[]): FormGroup[] {
  const groups = new Map<string, DerivedForm[]>();
  for (const f of forms) {
    const cat = posCategory(
      Object.entries({
        N: 'Noun', PN: 'Proper Noun', ADJ: 'Adjective', V: 'Verb',
        PRON: 'Pronoun', DEM: 'Demonstrative', REL: 'Relative Pronoun',
        ADV: 'Adverb', CONJ: 'Conjunction', P: 'Preposition',
        NEG: 'Negative Particle', INTG: 'Interrogative', COND: 'Conditional',
        T: 'Time Adverb', LOC: 'Location Adverb', INL: 'Initials',
      }).find(([, v]) => v === f.pos)?.[0] ?? null,
    );
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(f);
  }

  // Sort forms within each group by count descending
  Array.from(groups.keys()).forEach((key) => {
    groups.get(key)!.sort((a, b) => b.count - a.count);
  });

  return CATEGORY_ORDER
    .filter((cat) => groups.has(cat))
    .map((cat) => ({ label: cat, forms: groups.get(cat)! }));
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

  const [rootCount, setRootCount] = useState<number | null>(null);
  const [formGroups, setFormGroups] = useState<FormGroup[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(false);

  // Load root derived forms
  useEffect(() => {
    if (!word.root) return;
    let cancelled = false;
    setLoadingRefs(true);
    setFormGroups([]);

    loadRootsIndex().then(async (index) => {
      if (cancelled || !index) { setLoadingRefs(false); return; }
      const entry = index[word.root!];
      if (!entry) { setLoadingRefs(false); return; }

      setRootCount(entry.occurrences);

      // Sample up to 15 surahs to discover diverse derived forms
      const forms = await collectDerivedForms(entry.verses, 15);
      if (cancelled) return;

      setFormGroups(groupByCategory(forms));
      setLoadingRefs(false);
    });

    return () => { cancelled = true; };
  }, [word.root]);

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

  const totalForms = formGroups.reduce((sum, g) => sum + g.forms.length, 0);

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

        {/* Root Exploration — derived forms grouped by POS */}
        {word.root && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Words from this root
              </h4>
              {rootCount !== null && (
                <span className="text-[10px] text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                  {rootCount.toLocaleString()} uses &middot; {totalForms} forms
                </span>
              )}
            </div>

            {loadingRefs && formGroups.length === 0 && (
              <p className="text-xs text-gray-400 italic">Discovering word forms...</p>
            )}

            {formGroups.length > 0 && (
              <div className="space-y-2.5">
                {formGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                      {group.label}
                    </p>
                    <div className="space-y-1">
                      {group.forms.map((form) => (
                        <a
                          key={form.lemma}
                          href={`/quran?start=${form.exampleSurah}:${Math.max(1, form.exampleVerse - 3)}&end=${form.exampleSurah}:${form.exampleVerse + 3}`}
                          className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-gray-50 transition-colors"
                        >
                          <span dir="rtl" lang="ar" className="font-arabic text-base text-gray-800 shrink-0">
                            {form.lemma}
                          </span>
                          <span className="text-gray-500 truncate flex-1">
                            {form.translation}
                          </span>
                          <span className="shrink-0 flex items-center gap-1">
                            <span className="text-[10px] text-gray-300 bg-gray-50 rounded px-1">
                              {form.pos}{form.verbForm ? ` ${form.verbForm}` : ''}
                            </span>
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </FloatingPortal>
  );
}
