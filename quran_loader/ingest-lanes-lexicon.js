/**
 * ingest-lanes-lexicon.js
 *
 * Downloads Lane's Lexicon data from the quran-arabic-roots-lane-lexicon repo,
 * processes it, and splits into per-letter JSON files at public/quran/words/lanes/
 *
 * Each file is keyed by spaced root (e.g., "ر ح م") to match the existing roots.json format.
 *
 * Usage: node ingest-lanes-lexicon.js [--force]
 *   --force   Overwrite existing files
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'quran', 'words', 'lanes');
const DATA_URL =
  'https://raw.githubusercontent.com/aliozdenisik/quran-arabic-roots-lane-lexicon/master/quran_arabic_roots_lane_lexicon_2026-02-12.json';
const CACHE_FILE = path.join(__dirname, 'data', 'lanes-lexicon-raw.json');

// --- Helpers ---

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      https.get(u, { headers: { 'User-Agent': 'maktabah-loader' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          get(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }).on('error', reject);
    };
    get(url);
  });
}

/**
 * Convert concatenated Arabic root (e.g., "رحم") to spaced format (e.g., "ر ح م")
 * to match the format used in roots.json and word data files.
 */
function spaceRoot(root) {
  if (!root) return null;
  // Already spaced
  if (root.includes(' ')) return root;
  // Split into individual characters (Arabic letters)
  return [...root].join(' ');
}

/**
 * Get the first Arabic letter of a root for bucketing into per-letter files.
 */
function firstLetter(spacedRoot) {
  return spacedRoot.split(' ')[0];
}

/**
 * Truncate text to a preview length, breaking at word boundaries.
 */
function truncatePreview(text, maxLen = 500) {
  if (!text || text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '…';
}

// --- Main ---

async function main() {
  const force = process.argv.includes('--force');

  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Download or use cache
  let rawJson;
  if (fs.existsSync(CACHE_FILE) && !force) {
    console.log('Using cached Lane\'s Lexicon data...');
    rawJson = fs.readFileSync(CACHE_FILE, 'utf8');
  } else {
    console.log('Downloading Lane\'s Lexicon data from GitHub...');
    rawJson = await fetchUrl(DATA_URL);
    fs.writeFileSync(CACHE_FILE, rawJson, 'utf8');
    console.log(`Cached raw data to ${CACHE_FILE}`);
  }

  const data = JSON.parse(rawJson);
  const roots = data.roots;
  console.log(`Loaded ${roots.length} roots (${data.metadata.total_roots} expected)`);

  // Group by first letter of the spaced root
  const buckets = new Map();
  let skipped = 0;

  for (const entry of roots) {
    const spaced = spaceRoot(entry.root);
    if (!spaced) { skipped++; continue; }

    const letter = firstLetter(spaced);
    if (!buckets.has(letter)) buckets.set(letter, {});

    const bucket = buckets.get(letter);

    // Build the processed entry
    bucket[spaced] = {
      root_ar: entry.root,
      summary: entry.summary_en || null,
      definition: entry.definition_en || null,
      preview: truncatePreview(entry.definition_en),
      source: entry.source, // "lane" or "corpus_only"
      frequency: entry.quran_frequency,
      morphological_forms: (entry.morphological_forms || []).map((f) => ({
        pattern: f.form_pattern,
        arabic: f.form_arabic,
        name: f.form_name,
        category: f.form_category,
        example: f.example_word,
        occurrences: f.occurrences,
      })),
    };
  }

  if (skipped > 0) console.log(`Skipped ${skipped} entries with no root`);

  // Write per-letter files
  let totalRoots = 0;
  for (const [letter, entries] of buckets) {
    const count = Object.keys(entries).length;
    totalRoots += count;
    const outPath = path.join(OUTPUT_DIR, `${letter}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entries, null, 0), 'utf8');
    const sizeKB = (Buffer.byteLength(JSON.stringify(entries)) / 1024).toFixed(1);
    console.log(`  ${letter}: ${count} roots (${sizeKB} KB)`);
  }

  // Write an index file listing all letters and their root counts
  const index = {};
  for (const [letter, entries] of buckets) {
    index[letter] = Object.keys(entries).length;
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'index.json'),
    JSON.stringify(index, null, 2),
    'utf8',
  );

  console.log(`\nDone! ${totalRoots} roots across ${buckets.size} letter files in ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
