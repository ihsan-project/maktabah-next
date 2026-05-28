import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import VerseClient from './VerseClient';
import { getMetadata, getVerse, getContext, getAdjacent } from '@/lib/quran-data';

export const dynamicParams = true;
export const revalidate = false;

export function generateStaticParams() {
  return [] as { surah: string; verse: string }[];
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';
const RADIUS = 2;

function parseRef(params: { surah: string; verse: string }) {
  const surah = Number(params.surah);
  const verse = Number(params.verse);
  if (!Number.isInteger(surah) || !Number.isInteger(verse)) return null;
  if (surah < 1 || surah > 114 || verse < 1) return null;
  return { surah, verse };
}

export function generateMetadata({ params }: { params: { surah: string; verse: string } }): Metadata {
  const ref = parseRef(params);
  const v = ref ? getVerse(ref.surah, ref.verse) : null;
  if (!ref || !v) return {};
  const sahih = v.translations.find((t) => t.author === 'Saheeh International') || v.translations[0];
  const desc = (sahih?.text || `Quran ${ref.surah}:${ref.verse}`).slice(0, 155);
  const url = `${SITE}/quran/${ref.surah}/${ref.verse}`;
  return {
    title: `Quran ${ref.surah}:${ref.verse} — ${v.surahName}`,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: `Quran ${ref.surah}:${ref.verse} — ${v.surahName}`, description: desc, url, type: 'article' },
  };
}

export default function VersePage({ params }: { params: { surah: string; verse: string } }) {
  const ref = parseRef(params);
  const focal = ref ? getVerse(ref.surah, ref.verse) : null;
  if (!ref || !focal) notFound();

  const context = getContext(ref.surah, ref.verse, RADIUS);
  const { prev, next } = getAdjacent(ref.surah, ref.verse);
  const allAuthors = getMetadata().translators;
  const sahih = focal.translations.find((t) => t.author === 'Saheeh International') || focal.translations[0];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: `Quran ${ref.surah}:${ref.verse}`,
    inLanguage: ['ar', 'en'],
    text: sahih?.text,
    url: `${SITE}/quran/${ref.surah}/${ref.verse}`,
    isPartOf: { '@type': 'CreativeWork', name: `Surah ${focal.surahName}`, url: `${SITE}/quran/${ref.surah}` },
  };

  return (
    <div className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <VerseClient focal={focal} context={context} prev={prev} next={next} allAuthors={allAuthors} />
    </div>
  );
}
