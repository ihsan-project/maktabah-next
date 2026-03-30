/**
 * Generates a static sitemap.xml in the public/ directory.
 * Run this before `next build` (included in the build script).
 */
const fs = require('fs');
const path = require('path');

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

// Must match ALLOWED_STORIES in lib/story-config.ts
const ALLOWED_STORIES = [
  'adam',
  'noah',
  'abraham',
  'ismail_ishaq',
  'yusuf',
  'ayyub',
  'moses',
  'dawud',
  'sulayman',
  'yunus',
  'maryam',
  'jesus',
  'khadija',
];

const today = new Date().toISOString().split('T')[0];

const staticPages = [
  { loc: '', changefreq: 'weekly', priority: '1.0' },
  { loc: '/quran', changefreq: 'monthly', priority: '0.9' },
];

const storyPages = ALLOWED_STORIES.map((name) => ({
  loc: `/story/${name}`,
  changefreq: 'monthly',
  priority: '0.8',
}));

const allPages = [...staticPages, ...storyPages];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${SITE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

const outPath = path.join(__dirname, '..', 'public', 'sitemap.xml');
fs.writeFileSync(outPath, sitemap, 'utf8');
console.log(`Sitemap written to ${outPath}`);
