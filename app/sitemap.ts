import type { MetadataRoute } from 'next';
import { getMetadata } from '@/lib/quran-data';
import { listStories } from '@/lib/story-data';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPages = ['', '/quran', '/stories'].map((p) => ({ url: `${SITE}${p}`, lastModified: now }));

  const storyPages = listStories().flatMap((s) => [
    { url: `${SITE}/story/${s.name}`, lastModified: now },
    ...Array.from({ length: Math.max(0, s.pageCount - 1) }, (_, i) => ({
      url: `${SITE}/story/${s.name}/${i + 2}`,
      lastModified: now,
    })),
  ]);

  const surahs = getMetadata().surahs;
  const surahPages = surahs.map((s) => ({ url: `${SITE}/quran/${s.index}`, lastModified: now }));
  const versePages = surahs.flatMap((s) =>
    Array.from({ length: s.verseCount }, (_, i) => ({ url: `${SITE}/quran/${s.index}/${i + 1}`, lastModified: now })),
  );

  return [...staticPages, ...storyPages, ...surahPages, ...versePages];
}
