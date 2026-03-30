import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import QuranClient from './page.client';

const siteUrlMeta = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  title: 'Quran Reader - Maktabah',
  description: 'Read the Quran with 17 English translations side by side. Browse any verse range with a horizontal translation carousel.',
  keywords: ['quran', 'quran reader', 'quran translations', 'islamic text', 'tanzil', 'quran english', 'quran online'],
  alternates: {
    canonical: `${siteUrlMeta}/quran`,
  },
  openGraph: {
    title: 'Quran Reader - Maktabah',
    description: 'Read the Quran with 17 English translations side by side.',
    type: 'website',
    url: `${siteUrlMeta}/quran`,
  },
};

export default function QuranPage() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Quran Reader - Maktabah',
    description: 'Read the Quran with 17 English translations side by side. Browse any verse range with a horizontal translation carousel.',
    url: `${siteUrl}/quran`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Maktabah',
      url: siteUrl,
    },
    about: {
      '@type': 'CreativeWork',
      name: 'The Quran',
      inLanguage: ['ar', 'en'],
    },
  };

  return (
    <div className="py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="text-3xl font-bold text-center text-primary mb-2">Quran Reader</h1>
      <p className="text-center text-gray-600 mb-6">
        Browse any verse range with 17 English translations
      </p>
      <Suspense fallback={
        <div className="text-center py-12 text-gray-500">Loading Quran reader...</div>
      }>
        <QuranClient />
      </Suspense>
    </div>
  );
}
