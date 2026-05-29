import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStoryPage } from '@/lib/story-data';
import StoryReaderClient from './StoryReaderClient';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

function StoryPagination({ name, page, pageCount }: { name: string; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => (p === 1 ? `/story/${name}` : `/story/${name}/${p}`);
  return (
    <nav className="mt-10 flex items-center justify-between text-sm" aria-label="Story pages">
      {page > 1 ? (
        <Link href={href(page - 1)} className="text-primary hover:underline">← Page {page - 1}</Link>
      ) : (
        <span />
      )}
      <span className="text-gray-500">Page {page} of {pageCount}</span>
      {page < pageCount ? (
        <Link href={href(page + 1)} className="text-primary hover:underline">Page {page + 1} →</Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export default function StoryReader({ name, page }: { name: string; page: number }) {
  const data = getStoryPage(name, page);
  if (!data) notFound();

  const base = `${SITE}/story/${name}`;
  const pageUrl = page === 1 ? base : `${base}/${page}`;
  const prevUrl = page === 2 ? base : page > 2 ? `${base}/${page - 1}` : null;
  const nextUrl = page < data.pageCount ? `${base}/${page + 1}` : null;
  const heading = page === 1 ? data.title : `${data.title} — Page ${page} of ${data.pageCount}`;

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: heading,
    description: data.description,
    url: pageUrl,
    publisher: { '@type': 'Organization', name: 'Maktabah', url: SITE },
    mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Stories', item: `${SITE}/stories` },
      { '@type': 'ListItem', position: 2, name: data.title, item: base },
      ...(page > 1 ? [{ '@type': 'ListItem', position: 3, name: `Page ${page}`, item: pageUrl }] : []),
    ],
  };

  return (
    <div className="py-8">
      {prevUrl && <link rel="prev" href={prevUrl} />}
      {nextUrl && <link rel="next" href={nextUrl} />}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />

      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/stories" className="hover:underline">Stories</Link> ›{' '}
        <Link href={`/story/${name}`} className="hover:underline">{data.title}</Link>
        {page > 1 && <> › Page {page}</>}
      </nav>

      <h1 className="text-3xl font-bold text-center text-primary mb-2">{data.title}</h1>
      <p className="text-center text-gray-600 mb-6">
        {data.totalVerses} verses{data.pageCount > 1 ? ` · Page ${page} of ${data.pageCount}` : ''}
      </p>

      <StoryReaderClient name={name} verses={data.verses} defaultTranslator={data.defaultTranslator} />

      <StoryPagination name={name} page={page} pageCount={data.pageCount} />
    </div>
  );
}
