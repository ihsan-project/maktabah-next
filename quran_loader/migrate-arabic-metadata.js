#!/usr/bin/env node

/**
 * Migration script: Backfill existing OpenSearch Quran documents with
 * Arabic text (Uthmani display + Simple Clean search) and surah metadata
 * from Tanzil.net data files.
 *
 * Data sources (expected in ./data/):
 *   - quran-data.xml      — surah names, verse counts, revelation type, juz/hizb boundaries
 *   - quran-uthmani.txt   — Uthmani script Arabic text (pipe-delimited: chapter|verse|text)
 *   - quran-simple-clean.txt — Simple Clean Arabic text for search
 *
 * Usage:
 *   node migrate-arabic-metadata.js [--dry-run]
 *
 * The script updates existing documents in the "kitaab" index that have title="quran".
 * It uses the bulk update API so existing fields (text, text_embedding, author, etc.) are untouched.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('@opensearch-project/opensearch');
const { DOMParser } = require('@xmldom/xmldom');
const xpath = require('xpath');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const INDEX_NAME = 'kitaab';
const DRY_RUN = process.argv.includes('--dry-run');

// Initialize OpenSearch client
const opensearchClient = new Client({
  node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
  auth: (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD)
    ? { username: process.env.OPENSEARCH_USERNAME, password: process.env.OPENSEARCH_PASSWORD }
    : undefined,
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
});

// ---------------------------------------------------------------------------
// 1. Parse quran-data.xml for surah metadata and juz/hizb boundaries
// ---------------------------------------------------------------------------

function parseSurahMetadata(xmlPath) {
  const xmlContent = fs.readFileSync(xmlPath, 'utf8');
  const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');

  // Surahs: index → { name, tname, ename, type, ayas, start }
  const surahs = new Map();
  const suraElements = xpath.select('//suras/sura', doc);
  for (const el of suraElements) {
    const index = parseInt(el.getAttribute('index'), 10);
    surahs.set(index, {
      name: el.getAttribute('name'),         // Arabic name
      tname: el.getAttribute('tname'),       // Transliterated name
      ename: el.getAttribute('ename'),       // English name
      type: el.getAttribute('type'),         // Meccan / Medinan
      ayas: parseInt(el.getAttribute('ayas'), 10),
      start: parseInt(el.getAttribute('start'), 10), // cumulative verse offset
    });
  }

  // Juz boundaries: array of { index, sura, aya }
  const juzBoundaries = xpath.select('//juzs/juz', doc).map(el => ({
    index: parseInt(el.getAttribute('index'), 10),
    sura: parseInt(el.getAttribute('sura'), 10),
    aya: parseInt(el.getAttribute('aya'), 10),
  }));

  // Hizb quarter boundaries: array of { index, sura, aya }
  const hizbQuarters = xpath.select('//hizbs/quarter', doc).map(el => ({
    index: parseInt(el.getAttribute('index'), 10),
    sura: parseInt(el.getAttribute('sura'), 10),
    aya: parseInt(el.getAttribute('aya'), 10),
  }));

  return { surahs, juzBoundaries, hizbQuarters };
}

/**
 * Build a lookup: "chapter_verse" → { juz, hizb }
 * Uses cumulative verse numbering to determine which juz/hizb a verse falls in.
 */
function buildJuzHizbLookup(surahs, juzBoundaries, hizbQuarters) {
  // Convert (sura, aya) boundary to cumulative verse number
  function toCumulative(sura, aya) {
    const surah = surahs.get(sura);
    return surah ? surah.start + aya : 0;
  }

  // Sort boundaries by cumulative position (should already be sorted, but be safe)
  const juzSorted = juzBoundaries
    .map(b => ({ index: b.index, cum: toCumulative(b.sura, b.aya) }))
    .sort((a, b) => a.cum - b.cum);

  const hizbSorted = hizbQuarters
    .map(b => ({ index: b.index, cum: toCumulative(b.sura, b.aya) }))
    .sort((a, b) => a.cum - b.cum);

  // For a given cumulative verse, find which juz/hizb it's in
  function findBucket(sorted, cumVerse) {
    let result = sorted[0]?.index || 1;
    for (const b of sorted) {
      if (cumVerse >= b.cum) {
        result = b.index;
      } else {
        break;
      }
    }
    return result;
  }

  // Build full lookup
  const lookup = new Map();
  for (const [suraIndex, surah] of surahs) {
    for (let aya = 1; aya <= surah.ayas; aya++) {
      const cum = surah.start + aya;
      const key = `${suraIndex}_${aya}`;
      lookup.set(key, {
        juz: findBucket(juzSorted, cum),
        hizb: findBucket(hizbSorted, cum),
      });
    }
  }

  return lookup;
}

// ---------------------------------------------------------------------------
// 2. Parse pipe-delimited Arabic text files
// ---------------------------------------------------------------------------

function parseArabicTextFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lookup = new Map(); // "chapter_verse" → text

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('|');
    if (parts.length < 3) continue;
    const chapter = parseInt(parts[0], 10);
    const verse = parseInt(parts[1], 10);
    const text = parts.slice(2).join('|'); // In case text contains |
    if (chapter && verse && text) {
      lookup.set(`${chapter}_${verse}`, text);
    }
  }

  return lookup;
}

// ---------------------------------------------------------------------------
// 3. Find all existing Quran document IDs in OpenSearch
// ---------------------------------------------------------------------------

async function findQuranDocIds() {
  const ids = [];
  let searchAfter = null;

  while (true) {
    const body = {
      size: 1000,
      query: { term: { title: 'quran' } },
      sort: [{ _id: 'asc' }],
      _source: ['chapter', 'verse'],
    };
    if (searchAfter) {
      body.search_after = searchAfter;
    }

    const { body: result } = await opensearchClient.search({
      index: INDEX_NAME,
      body,
    });

    const hits = result.hits.hits;
    if (hits.length === 0) break;

    for (const hit of hits) {
      ids.push({
        id: hit._id,
        chapter: hit._source.chapter,
        verse: hit._source.verse,
      });
    }

    searchAfter = hits[hits.length - 1].sort;
  }

  return ids;
}

// ---------------------------------------------------------------------------
// 4. Update index mapping to add new fields (idempotent)
// ---------------------------------------------------------------------------

async function updateMapping() {
  try {
    await opensearchClient.indices.putMapping({
      index: INDEX_NAME,
      body: {
        properties: {
          text_arabic_uthmani: {
            type: 'text',
            analyzer: 'arabic_analyzer',
            index: false,
          },
          surah_name: { type: 'keyword' },
          surah_name_arabic: { type: 'keyword', index: false },
          surah_name_english: { type: 'keyword', index: false },
          revelation_type: { type: 'keyword' },
          juz: { type: 'integer' },
          hizb: { type: 'integer' },
        },
      },
    });
    console.log('Index mapping updated with new fields');
  } catch (err) {
    // If fields already exist with compatible types, this is fine
    if (err?.meta?.statusCode === 400 && err?.body?.error?.type === 'illegal_argument_exception') {
      console.log('Mapping fields already exist (compatible), continuing...');
    } else {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Bulk-update documents with Arabic text and metadata
// ---------------------------------------------------------------------------

async function bulkUpdate(docs, surahs, juzHizbLookup, uthmaniLookup, simpleCleanLookup) {
  const BATCH_SIZE = 200;
  const MAX_RETRIES = 5;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(docs.length / BATCH_SIZE);

    const operations = [];
    for (const doc of batch) {
      const key = `${doc.chapter}_${doc.verse}`;
      const surah = surahs.get(doc.chapter);
      const juzHizb = juzHizbLookup.get(key);
      const uthmani = uthmaniLookup.get(key);
      const simpleClean = simpleCleanLookup.get(key);

      if (!surah) {
        skipped++;
        continue;
      }

      const updateFields = {};

      if (uthmani) {
        updateFields.text_arabic_uthmani = uthmani;
      }
      // Update the existing text.arabic sub-field by writing to the parent text field?
      // No — text.arabic is a multi-field of "text" and is auto-derived from "text" at index time.
      // Instead, we can store simple clean Arabic as a separate searchable field if needed.
      // For now, the simple clean text will be useful for the search query side (future enhancement).

      updateFields.surah_name = surah.tname;
      updateFields.surah_name_arabic = surah.name;
      updateFields.surah_name_english = surah.ename;
      updateFields.revelation_type = surah.type;

      if (juzHizb) {
        updateFields.juz = juzHizb.juz;
        updateFields.hizb = juzHizb.hizb;
      }

      operations.push({ update: { _index: INDEX_NAME, _id: doc.id } });
      operations.push({ doc: updateFields });
    }

    if (operations.length === 0) continue;

    if (DRY_RUN) {
      const sampleDoc = operations[1]?.doc;
      console.log(`[DRY RUN] Batch ${batchNum}/${totalBatches}: would update ${operations.length / 2} docs`);
      if (sampleDoc) {
        console.log('  Sample update:', JSON.stringify(sampleDoc, null, 2));
      }
      updated += operations.length / 2;
      continue;
    }

    // Execute bulk update with retry
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { body: result } = await opensearchClient.bulk({
          refresh: false,
          body: operations,
        });

        if (result.errors) {
          const errorItems = result.items.filter(item => item.update && item.update.error);
          errors += errorItems.length;
          updated += (operations.length / 2 - errorItems.length);
          if (errorItems.length > 0) {
            console.error(`  Batch ${batchNum}: ${errorItems.length} errors. Sample:`,
              JSON.stringify(errorItems[0].update.error));
          }
        } else {
          updated += operations.length / 2;
        }

        console.log(`  Batch ${batchNum}/${totalBatches}: updated ${operations.length / 2} docs`);
        break;
      } catch (bulkError) {
        const statusCode = bulkError?.meta?.statusCode;
        if (statusCode === 429 && attempt < MAX_RETRIES - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`  Rate limited. Retrying batch ${batchNum} in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw bulkError;
        }
      }
    }

    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { updated, skipped, errors };
}

// ---------------------------------------------------------------------------
// 6. Verification — spot-check a few verses
// ---------------------------------------------------------------------------

async function verifyMigration() {
  const spotChecks = [
    { chapter: 1, verse: 1, label: 'Al-Fatiha 1:1' },
    { chapter: 2, verse: 255, label: 'Ayat al-Kursi 2:255' },
    { chapter: 112, verse: 1, label: 'Al-Ikhlas 112:1' },
    { chapter: 36, verse: 1, label: 'Ya-Sin 36:1' },
    { chapter: 55, verse: 13, label: 'Ar-Rahman 55:13' },
  ];

  console.log('\n--- Verification Spot-Checks ---');

  for (const check of spotChecks) {
    const { body: result } = await opensearchClient.search({
      index: INDEX_NAME,
      body: {
        size: 1,
        query: {
          bool: {
            must: [
              { term: { title: 'quran' } },
              { term: { chapter: check.chapter } },
              { term: { verse: check.verse } },
            ],
          },
        },
      },
    });

    const hit = result.hits.hits[0];
    if (!hit) {
      console.log(`  [MISS] ${check.label}: no document found`);
      continue;
    }

    const s = hit._source;
    console.log(`  [OK] ${check.label}:`);
    console.log(`    surah_name:       ${s.surah_name || '(missing)'}`);
    console.log(`    surah_name_arabic: ${s.surah_name_arabic || '(missing)'}`);
    console.log(`    revelation_type:  ${s.revelation_type || '(missing)'}`);
    console.log(`    juz: ${s.juz || '(missing)'}  hizb: ${s.hizb || '(missing)'}`);
    const arabicPreview = (s.text_arabic_uthmani || '').substring(0, 80);
    console.log(`    arabic (uthmani): ${arabicPreview || '(missing)'}...`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  try {
    console.log('=== Tanzil Arabic Text & Metadata Migration ===');
    if (DRY_RUN) console.log('[DRY RUN MODE — no writes will be made]\n');

    const dataDir = path.resolve(__dirname, 'data');

    // Validate data files exist
    const requiredFiles = ['quran-data.xml', 'quran-uthmani.txt', 'quran-simple-clean.txt'];
    for (const file of requiredFiles) {
      const filePath = path.join(dataDir, file);
      if (!fs.existsSync(filePath)) {
        console.error(`Missing data file: ${filePath}`);
        console.error('Download from https://tanzil.net/download/ and place in quran_loader/data/');
        process.exit(1);
      }
    }

    // Step 1: Parse metadata
    console.log('Parsing quran-data.xml...');
    const { surahs, juzBoundaries, hizbQuarters } = parseSurahMetadata(
      path.join(dataDir, 'quran-data.xml')
    );
    console.log(`  ${surahs.size} surahs, ${juzBoundaries.length} juz boundaries, ${hizbQuarters.length} hizb quarters`);

    // Step 2: Build juz/hizb lookup
    console.log('Building juz/hizb lookup...');
    const juzHizbLookup = buildJuzHizbLookup(surahs, juzBoundaries, hizbQuarters);
    console.log(`  ${juzHizbLookup.size} verse entries`);

    // Step 3: Parse Arabic text files
    console.log('Parsing Arabic text files...');
    const uthmaniLookup = parseArabicTextFile(path.join(dataDir, 'quran-uthmani.txt'));
    const simpleCleanLookup = parseArabicTextFile(path.join(dataDir, 'quran-simple-clean.txt'));
    console.log(`  Uthmani: ${uthmaniLookup.size} verses, Simple Clean: ${simpleCleanLookup.size} verses`);

    // Step 4: Update index mapping
    if (!DRY_RUN) {
      console.log('\nUpdating index mapping...');
      await updateMapping();
    }

    // Step 5: Find all existing Quran documents
    console.log('\nFinding existing Quran documents in OpenSearch...');
    const quranDocs = await findQuranDocIds();
    console.log(`  Found ${quranDocs.length} Quran documents to update`);

    if (quranDocs.length === 0) {
      console.log('No Quran documents found in index. Run the loader first.');
      process.exit(0);
    }

    // Step 6: Bulk update
    console.log('\nUpdating documents with Arabic text and metadata...');
    const { updated, skipped, errors } = await bulkUpdate(
      quranDocs, surahs, juzHizbLookup, uthmaniLookup, simpleCleanLookup
    );

    if (!DRY_RUN) {
      await opensearchClient.indices.refresh({ index: INDEX_NAME });
    }

    console.log(`\nMigration complete: ${updated} updated, ${skipped} skipped, ${errors} errors`);

    // Step 7: Verify
    if (!DRY_RUN) {
      await verifyMigration();
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await opensearchClient.close();
  }
}

main().catch(console.error);
