/**
 * fetch-word-by-word.js
 *
 * Downloads word-by-word Quran data from two sources:
 *   1. Quran.com API — text_uthmani, translation, transliteration per word
 *   2. mustafa0x/quran-morphology (GitHub) — root, lemma, POS, morphology per word segment
 *
 * Merges them into per-surah JSON files at public/quran/words/{1-114}.json
 *
 * Usage: node fetch-word-by-word.js [--surah=N] [--force]
 *   --surah=N   Only fetch a specific surah (for testing)
 *   --force     Overwrite existing files
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'quran', 'words');
const MORPHOLOGY_CACHE = path.join(__dirname, 'data', 'quran-morphology.txt');
const MORPHOLOGY_URL = 'https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt';
const API_BASE = 'https://api.quran.com/api/v4';
const PER_PAGE = 50;
const RATE_LIMIT_MS = 500; // delay between API requests

// --- Helpers ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function fetchJson(url) {
  const data = await httpsGet(url);
  return JSON.parse(data);
}

function parseArgs() {
  const args = { surah: null, force: false };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--surah=')) args.surah = parseInt(arg.split('=')[1]);
    if (arg === '--force') args.force = true;
  }
  return args;
}

// --- Morphology parsing ---

/**
 * Parse the morphology corpus into a nested map:
 *   morphMap[surah][verse][wordPos] = { root, lemma, pos, morphology }
 *
 * The corpus has segments within words (surah:verse:word:segment).
 * We aggregate segments per word, extracting root/lemma from the STEM segment
 * (the one with ROOT: in its morphology string).
 */
function parseMorphologyCorpus(text) {
  const morphMap = {};
  const lines = text.split('\n');

  for (const line of lines) {
    if (!line.trim() || line.startsWith('#')) continue;

    const parts = line.split('\t');
    if (parts.length < 4) continue;

    const [location, , posTag, morphStr] = parts;
    const [surah, verse, word] = location.split(':').map(Number);

    if (!morphMap[surah]) morphMap[surah] = {};
    if (!morphMap[surah][verse]) morphMap[surah][verse] = {};
    if (!morphMap[surah][verse][word]) {
      morphMap[surah][verse][word] = { root: null, lemma: null, pos: null, morphology: '' };
    }

    const entry = morphMap[surah][verse][word];

    // Extract root from morphology string (e.g., ROOT:رحم)
    const rootMatch = morphStr.match(/ROOT:([^\s|]+)/);
    if (rootMatch && !entry.root) {
      entry.root = rootMatch[1];
    }

    // Extract lemma from the stem segment (the one with ROOT), not prefixes/suffixes
    const lemmaMatch = morphStr.match(/LEM:([^\s|]+)/);
    if (rootMatch && lemmaMatch) {
      // Prefer the lemma from the segment that contains ROOT
      entry.lemma = lemmaMatch[1];
    } else if (lemmaMatch && !entry.lemma && !entry.root) {
      // Fallback for words without roots (pronouns, particles)
      entry.lemma = lemmaMatch[1];
    }

    // Use POS from the stem segment (has ROOT), not prefixes/suffixes
    if (rootMatch && posTag !== 'P') {
      entry.pos = posTag;
    }

    // Build full morphology string from all segments
    if (entry.morphology) {
      entry.morphology += '|' + morphStr;
    } else {
      entry.morphology = morphStr;
    }
  }

  return morphMap;
}

/**
 * Format root with spaces between letters for display (e.g., "رحم" → "ر ح م")
 */
function formatRoot(root) {
  if (!root) return null;
  return [...root].join(' ');
}

// --- API fetching ---

async function fetchSurahWords(surahNum) {
  const allVerses = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url = `${API_BASE}/verses/by_chapter/${surahNum}?language=en&words=true&word_fields=text_uthmani,translation,transliteration&per_page=${PER_PAGE}&page=${page}`;

    const data = await fetchJson(url);
    totalPages = data.pagination.total_pages;
    allVerses.push(...data.verses);

    if (page < totalPages) {
      await sleep(RATE_LIMIT_MS);
    }
    page++;
  }

  return allVerses;
}

// --- Main ---

async function main() {
  const args = parseArgs();

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Step 1: Load morphology data
  console.log('Loading morphology corpus...');
  let morphText;
  if (fs.existsSync(MORPHOLOGY_CACHE)) {
    console.log('  Using cached morphology data from', MORPHOLOGY_CACHE);
    morphText = fs.readFileSync(MORPHOLOGY_CACHE, 'utf-8');
  } else {
    console.log('  Downloading from GitHub...');
    morphText = await httpsGet(MORPHOLOGY_URL);
    fs.writeFileSync(MORPHOLOGY_CACHE, morphText, 'utf-8');
    console.log('  Cached to', MORPHOLOGY_CACHE);
  }

  const morphMap = parseMorphologyCorpus(morphText);
  console.log('  Parsed morphology data for', Object.keys(morphMap).length, 'surahs');

  // Step 2: Fetch word-by-word data from Quran.com API
  const surahs = args.surah ? [args.surah] : Array.from({ length: 114 }, (_, i) => i + 1);

  for (const surahNum of surahs) {
    const outFile = path.join(OUTPUT_DIR, `${surahNum}.json`);

    if (!args.force && fs.existsSync(outFile)) {
      console.log(`Surah ${surahNum}: already exists, skipping (use --force to overwrite)`);
      continue;
    }

    console.log(`Surah ${surahNum}: fetching from API...`);
    let apiVerses;
    try {
      apiVerses = await fetchSurahWords(surahNum);
    } catch (err) {
      console.error(`  ERROR fetching surah ${surahNum}: ${err.message}`);
      console.log('  Retrying after 5s...');
      await sleep(5000);
      try {
        apiVerses = await fetchSurahWords(surahNum);
      } catch (err2) {
        console.error(`  FAILED again: ${err2.message}. Skipping surah ${surahNum}.`);
        continue;
      }
    }

    const verses = {};
    for (const apiVerse of apiVerses) {
      const verseNum = apiVerse.verse_number;
      const words = [];

      for (const apiWord of apiVerse.words) {
        // Skip end-of-verse markers (verse number symbols)
        if (apiWord.char_type_name === 'end') continue;

        const pos = apiWord.position;
        const morph = morphMap[surahNum]?.[verseNum]?.[pos] || {};

        words.push({
          position: pos,
          text_uthmani: apiWord.text_uthmani,
          text_simple: (apiWord.text_uthmani || '').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, ''),
          translation: apiWord.translation?.text || null,
          transliteration: apiWord.transliteration?.text || null,
          root: formatRoot(morph.root),
          lemma: morph.lemma || null,
          pos: morph.pos || null,
          morphology: morph.morphology || null,
        });
      }

      verses[verseNum] = { words };
    }

    const output = {
      surah: surahNum,
      verses,
    };

    fs.writeFileSync(outFile, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  Wrote ${outFile} (${Object.keys(verses).length} verses, ${Object.values(verses).reduce((s, v) => s + v.words.length, 0)} words)`);

    await sleep(RATE_LIMIT_MS);
  }

  console.log('\nDone! Word-by-word data saved to', OUTPUT_DIR);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
