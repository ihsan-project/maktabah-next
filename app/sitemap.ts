import type { MetadataRoute } from 'next';
import { getMetadata } from '@/lib/quran-data';
import { ALLOWED_STORIES } from '@/lib/story-config';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ['', '/quran'].map((p) => ({ url: `${SITE}${p}`, lastModified: now }));
  const stories = ALLOWED_STORIES.map((name) => ({ url: `${SITE}/story/${name}`, lastModified: now }));

  const surahs = getMetadata().surahs;
  const surahPages = surahs.map((s) => ({ url: `${SITE}/quran/${s.index}`, lastModified: now }));
  const versePages = surahs.flatMap((s) =>
    Array.from({ length: s.verseCount }, (_, i) => ({ url: `${SITE}/quran/${s.index}/${i + 1}`, lastModified: now })),
  );

  return [...staticPages, ...stories, ...surahPages, ...versePages];
}
