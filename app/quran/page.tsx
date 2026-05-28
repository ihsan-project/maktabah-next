import type { Metadata } from 'next';
import Link from 'next/link';
import { getMetadata } from '@/lib/quran-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  title: 'Quran Reader — 17 English Translations | Maktabah',
  description: 'Read the Quran in Arabic with 17 English translations. Browse all 114 surahs verse by verse.',
  alternates: { canonical: `${SITE}/quran` },
  openGraph: { title: 'Quran Reader — Maktabah', description: 'Read the Quran with 17 English translations.', url: `${SITE}/quran`, type: 'website' },
};

export default function QuranIndexPage() {
  const meta = getMetadata();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Quran Reader — Maktabah',
    url: `${SITE}/quran`,
    isPartOf: { '@type': 'WebSite', name: 'Maktabah', url: SITE },
  };
  return (
    <div className="py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="text-3xl font-bold text-center text-primary mb-2">Quran Reader</h1>
      <p className="text-center text-gray-600 mb-6">Browse all 114 surahs with 17 English translations</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {meta.surahs.map((s) => (
          <Link
            key={s.index}
            href={`/quran/${s.index}`}
            className="block px-3 py-2 rounded-md bg-white shadow-sm hover:bg-gray-50 transition-colors text-sm"
          >
            <span className="text-gray-400 mr-1">{s.index}.</span>
            {s.name}
            <span className="block text-xs text-gray-400">{s.verseCount} verses</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
