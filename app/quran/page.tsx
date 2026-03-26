import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import QuranClient from './page.client';

export const metadata: Metadata = {
  title: 'Quran Reader - Maktabah',
  description: 'Read the Quran with 17 English translations side by side. Browse any verse range with a horizontal translation carousel.',
  keywords: ['quran', 'quran reader', 'quran translations', 'islamic text', 'tanzil'],
  openGraph: {
    title: 'Quran Reader - Maktabah',
    description: 'Read the Quran with 17 English translations side by side.',
    type: 'website',
    url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app'}/quran`,
  },
};

export default function QuranPage() {
  return (
    <div className="py-8">
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
