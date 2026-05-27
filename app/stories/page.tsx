import React from 'react';
import type { Metadata } from 'next';
import StoriesList from '@/app/components/StoriesList';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  title: 'Quranic Stories',
  description:
    'Explore the profound stories from the Quran — the Prophets and key figures — each curated with relevant verses and context.',
  alternates: { canonical: `${siteUrl}/stories` },
  openGraph: {
    title: 'Quranic Stories - Maktabah',
    description:
      'Explore the profound stories from the Quran, each curated with relevant verses and context.',
    type: 'website',
    url: `${siteUrl}/stories`,
  },
};

export default function StoriesPage() {
  return (
    <div className="pb-8">
      <h1 className="text-3xl font-bold text-center text-primary mb-6 pt-8">Quranic Stories</h1>

      <div className="container mx-auto px-4">
        <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
          Explore the profound stories from the Quran. Each story is curated with relevant verses and context to help you understand the narrative better.
        </p>

        <div className="flex justify-center">
          <StoriesList source="stories_page" />
        </div>
      </div>
    </div>
  );
}
