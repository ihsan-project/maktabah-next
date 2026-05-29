import type { Metadata } from 'next';
import { ALLOWED_STORIES } from '@/lib/story-config';
import { getStoryPage } from '@/lib/story-data';
import StoryReader from './StoryReader';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const dynamicParams = false;

export function generateStaticParams() {
  return ALLOWED_STORIES.map((name) => ({ name }));
}

export function generateMetadata({ params }: { params: { name: string } }): Metadata {
  const data = getStoryPage(params.name, 1);
  if (!data) return {};
  const url = `${SITE}/story/${params.name}`;
  return {
    title: data.title,
    description: data.description,
    alternates: { canonical: url },
    openGraph: { title: data.title, description: data.description, url, type: 'article' },
  };
}

export default function StoryPage({ params }: { params: { name: string } }) {
  return <StoryReader name={params.name} page={1} />;
}
