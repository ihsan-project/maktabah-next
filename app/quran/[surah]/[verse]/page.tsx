import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ArabicText from '@/app/components/ArabicText';
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
    <div className="py-8 max-w-3xl mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/quran" className="hover:underline">Quran</Link> ›{' '}
        <Link href={`/quran/${ref.surah}`} className="hover:underline">{focal.surahName}</Link> › Verse {ref.verse}
      </nav>
      <h1 className="text-2xl font-bold text-center text-primary mb-6">{focal.surahName} {ref.surah}:{ref.verse}</h1>

      {context.filter((c) => c.verse < ref.verse).map((c) => (
        <ContextVerse key={c.verse} surah={ref.surah} verse={c.verse} arabic={c.arabic} translation={c.translations.find((t) => t.author === 'Saheeh International')?.text || c.translations[0]?.text} />
      ))}

      <div className="my-6 ring-2 ring-primary/20 rounded-lg p-2" id={`v${ref.verse}`}>
        <VerseClient focal={focal} allAuthors={allAuthors} />
      </div>

      {context.filter((c) => c.verse > ref.verse).map((c) => (
        <ContextVerse key={c.verse} surah={ref.surah} verse={c.verse} arabic={c.arabic} translation={c.translations.find((t) => t.author === 'Saheeh International')?.text || c.translations[0]?.text} />
      ))}

      <div className="mt-8 flex justify-between text-sm">
        {prev ? <Link href={`/quran/${prev.surah}/${prev.verse}`} className="text-primary hover:underline">← {prev.surah}:{prev.verse}</Link> : <span />}
        {next ? <Link href={`/quran/${next.surah}/${next.verse}`} className="text-primary hover:underline">{next.surah}:{next.verse} →</Link> : <span />}
      </div>
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
