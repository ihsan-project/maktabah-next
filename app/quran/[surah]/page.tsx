import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMetadata, getSurah } from '@/lib/quran-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return getMetadata().surahs.map((s) => ({ surah: String(s.index) }));
}

function parseSurah(param: string) {
  const n = Number(param);
  if (!Number.isInteger(n) || n < 1 || n > 114) return null;
  return n;
}

export function generateMetadata({ params }: { params: { surah: string } }): Metadata {
  const idx = parseSurah(params.surah);
  if (!idx) return {};
  const s = getMetadata().surahs.find((x) => x.index === idx)!;
  const url = `${SITE}/quran/${idx}`;
  return {
    title: `Surah ${s.name} (${idx}) — ${s.verseCount} verses | Maktabah`,
    description: `Read Surah ${s.name}, the ${idx}th chapter of the Quran (${s.verseCount} verses), in Arabic with 17 English translations.`,
    alternates: { canonical: url },
    openGraph: { title: `Surah ${s.name} — Maktabah`, url, type: 'website' },
  };
}

export default function SurahPage({ params }: { params: { surah: string } }) {
  const idx = parseSurah(params.surah);
  if (!idx) notFound();
  const surah = getSurah(idx);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: `Surah ${surah.name}`,
    url: `${SITE}/quran/${idx}`,
    isPartOf: { '@type': 'CreativeWork', name: 'The Quran' },
  };
  return (
    <div className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="text-sm text-gray-500 mb-4"><Link href="/quran" className="hover:underline">Quran</Link> › {surah.name}</nav>
      <h1 className="text-3xl font-bold text-center text-primary mb-6">Surah {surah.name} <span className="text-gray-400 text-xl">({idx})</span></h1>
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
        {Array.from({ length: surah.verseCount }, (_, i) => i + 1).map((v) => (
          <Link key={v} href={`/quran/${idx}/${v}`} className="text-center px-2 py-2 rounded-md bg-white shadow-sm hover:bg-gray-50 text-sm">
            {idx}:{v}
          </Link>
        ))}
      </div>
    </div>
  );
}
