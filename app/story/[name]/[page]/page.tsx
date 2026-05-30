import type { Metadata } from 'next';
import { getStoryPage, listStories } from '@/lib/story-data';
import StoryReader from '../StoryReader';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return listStories().flatMap((s) =>
    Array.from({ length: Math.max(0, s.pageCount - 1) }, (_, i) => ({
      name: s.name,
      page: String(i + 2),
    })),
  );
}

export function generateMetadata({ params }: { params: { name: string; page: string } }): Metadata {
  const page = Number(params.page);
  const data = getStoryPage(params.name, page);
  if (!data) return {};
  const url = `${SITE}/story/${params.name}/${page}`;
  const title = `${data.title} — Page ${page} of ${data.pageCount}`;
  return {
    title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: { title, description: data.description, url, type: 'article' },
  };
}

export default function StoryPagePaginated({ params }: { params: { name: string; page: string } }) {
  return <StoryReader name={params.name} page={Number(params.page)} />;
}
