#!/usr/bin/env node

/**
 * Script to reorder story XML based on a CSV specification
 * 
 * Usage:
 *   node reorder-story.js <input-xml> <reorder-csv> <output-xml> [--no-fetch-missing]
 * 
 * Example:
 *   node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml
 *   node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml --no-fetch-missing
 * 
 * Note: Fetching missing verses from Elasticsearch is enabled by default.
 *       Use --no-fetch-missing to disable this behavior.
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { parse } = require('csv-parse/sync');
const { Client } = require('@elastic/elasticsearch');
require('dotenv').config();

/**
 * Parse verse range string (e.g., "51-67" or "4" or "116-117")
 * Returns array of verse numbers
 */
function parseVerseRange(verseRangeStr) {
  if (verseRangeStr.includes('-')) {
    const [start, end] = verseRangeStr.split('-').map(v => parseInt(v.trim()));
    const verses = [];
    for (let i = start; i <= end; i++) {
      verses.push(i);
    }
    return verses;
  } else {
    return [parseInt(verseRangeStr.trim())];
  }
}

/**
 * Check if a verse is a Quran verse (empty chapter_name) or Hadith (has chapter_name)
 */
function isQuranVerse(verse) {
  // Check if chapter_name is empty or doesn't exist
  if (!verse.chapter_name || !verse.chapter_name[0] || verse.chapter_name[0].trim() === '') {
    return true;
  }
  return false;
}

/**
 * Fetch a specific verse from Elasticsearch with all translations
 */
async function fetchVerseFromElasticsearch(chapter, verseNum, isQuran) {
  try {
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      auth: process.env.ELASTICSEARCH_APIKEY 
        ? { apiKey: process.env.ELASTICSEARCH_APIKEY } 
        : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
    
    const elasticsearchIndex = 'kitaab';
    
    // Build query to find specific verse
    // Fetch all verses with this chapter and verse number, then filter by type
    const searchQuery = {
      bool: {
        must: [
          { term: { chapter: chapter } },
          { term: { verse: verseNum } }
        ]
      }
    };
    
    const response = await client.search({
      index: elasticsearchIndex,
      body: {
        query: searchQuery,
        size: 100, // Get multiple results to capture all translations
        sort: [
          { author: { order: "asc" } }
        ]
      }
    });
    
    if (response.hits.hits.length > 0) {
      console.log(`    Found ${response.hits.hits.length} result(s) in Elasticsearch for Chapter ${chapter}, Verse ${verseNum}`);
      
      // Filter results by type (quran vs hadith) in JavaScript
      const matchingHits = response.hits.hits.filter(hit => {
        const source = hit._source;
        const hasChapterName = source.chapter_name && source.chapter_name.trim() !== '';
        
        // For Quran: chapter_name should be empty or not exist
        // For Hadith: chapter_name should have a value
        return isQuran ? !hasChapterName : hasChapterName;
      });
      
      if (matchingHits.length > 0) {
        const firstSource = matchingHits[0]._source;
        
        // Convert all translations to the new XML format
        const translations = matchingHits.map(hit => ({
          $: {
            author: hit._source.author
          },
          text: [hit._source.text]
        }));
        
        // Return verse in new format with all translations
        return {
          $: {
            chapter: String(firstSource.chapter),
            verse: String(firstSource.verse)
          },
          chapter_name: [firstSource.chapter_name || ''],
          book_id: [firstSource.book_id || ''],
          score: [String(firstSource.score || matchingHits[0]._score || 0)],
          translations: [{
            translation: translations
          }]
        };
      } else {
        // Debug: show what we found but couldn't match
        const typeFound = response.hits.hits[0]._source.chapter_name ? 'hadith' : 'quran';
        console.log(`    Found verse but wrong type (found: ${typeFound}, wanted: ${isQuran ? 'quran' : 'hadith'})`);
      }
    } else {
      console.log(`    No results found in Elasticsearch for Chapter ${chapter}, Verse ${verseNum}`);
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching verse from Elasticsearch: ${error.message}`);
    return null;
  }
}

/**
 * Find matching verses in the XML data
 * Returns { verses, usedIndices }
 */
async function findMatchingVerses(xmlVerses, chapter, verseNumbers, type, fetchMissing = false) {
  const matchedVerses = [];
  const usedIndices = [];
  const isQuran = type.toLowerCase() === 'quran';
  
  for (const verseNum of verseNumbers) {
    let matchIndex = -1;
    const match = xmlVerses.find((v, idx) => {
      const xmlChapter = parseInt(v.$.chapter);
      const xmlVerse = parseInt(v.$.verse);
      const xmlIsQuran = isQuranVerse(v);
      
      const isMatch = xmlChapter === chapter && 
                      xmlVerse === verseNum && 
                      xmlIsQuran === isQuran;
      
      if (isMatch) {
        matchIndex = idx;
      }
      return isMatch;
    });
    
    if (match) {
      matchedVerses.push(match);
      usedIndices.push(matchIndex);
    } else {
      // Try to fetch from Elasticsearch if flag is enabled
      if (fetchMissing) {
        console.log(`  Fetching from Elasticsearch: Chapter ${chapter}, Verse ${verseNum}, Type: ${type}`);
        const fetchedVerse = await fetchVerseFromElasticsearch(chapter, verseNum, isQuran);
        
        if (fetchedVerse) {
          matchedVerses.push(fetchedVerse);
          console.log(`  ✓ Successfully fetched verse`);
          // Don't add to usedIndices since it's not from source XML
        } else {
          console.warn(`  ✗ Could not fetch verse from Elasticsearch - Chapter ${chapter}, Verse ${verseNum}, Type: ${type}`);
        }
      } else {
        console.warn(`Warning: Could not find verse - Chapter ${chapter}, Verse ${verseNum}, Type: ${type}`);
      }
    }
  }
  
  return { verses: matchedVerses, usedIndices };
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node reorder-story.js <input-xml> <reorder-csv> <output-xml> [--no-fetch-missing]');
    console.error('Example: node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml');
    console.error('         node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml --no-fetch-missing');
    console.error('');
    console.error('Note: Fetching missing verses from Elasticsearch is enabled by default.');
    console.error('      Use --no-fetch-missing to disable this behavior.');
    process.exit(1);
  }
  
  const [inputXmlPath, reorderCsvPath, outputXmlPath] = args.slice(0, 3);
  // Default to true, disable only if --no-fetch-missing is specified
  const fetchMissing = !args.includes('--no-fetch-missing');
  
  if (fetchMissing) {
    console.log('Fetch missing verses from Elasticsearch: ENABLED (default)');
    
    // Check if Elasticsearch credentials are configured
    if (!process.env.ELASTICSEARCH_URL || !process.env.ELASTICSEARCH_APIKEY) {
      console.error('Error: Elasticsearch credentials not found in .env file');
      console.error('Please ensure ELASTICSEARCH_URL and ELASTICSEARCH_APIKEY are set');
      console.error('Or use --no-fetch-missing to skip fetching missing verses');
      process.exit(1);
    }
  } else {
    console.log('Fetch missing verses from Elasticsearch: DISABLED');
  }
  
  // Check if files exist
  if (!fs.existsSync(inputXmlPath)) {
    console.error(`Error: Input XML file not found: ${inputXmlPath}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(reorderCsvPath)) {
    console.error(`Error: Reorder CSV file not found: ${reorderCsvPath}`);
    process.exit(1);
  }
  
  console.log('Reading input files...');
  
  // Read and parse XML
  const xmlContent = fs.readFileSync(inputXmlPath, 'utf8');
  const parser = new xml2js.Parser();
  const xmlData = await parser.parseStringPromise(xmlContent);
  
  // Read and parse CSV
  const csvContent = fs.readFileSync(reorderCsvPath, 'utf8');
  const csvRecords = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
  
  console.log(`Found ${xmlData.story.verses[0].verse.length} verses in XML`);
  console.log(`Found ${csvRecords.length} reorder specifications in CSV`);
  
  // Get all verses from XML
  const allXmlVerses = xmlData.story.verses[0].verse;
  
  // Track which verses from source XML are used
  const usedVerseIndices = new Set();
  
  // Build new ordered verses with sections
  const reorderedVerses = [];
  let currentSection = null;
  
  for (const record of csvRecords) {
    const order = parseInt(record.order);
    const section = record.section;
    const chapter = parseInt(record.chapter);
    const verseRange = record.verse_range;
    const type = record.type;
    
    // Add section marker if new section
    if (section !== currentSection) {
      currentSection = section;
      reorderedVerses.push({
        section: [{
          _: section,
          $: { name: section }
        }]
      });
    }
    
    // Parse verse range and find matching verses
    const verseNumbers = parseVerseRange(verseRange);
    const result = await findMatchingVerses(allXmlVerses, chapter, verseNumbers, type, fetchMissing);
    
    // Track used indices
    result.usedIndices.forEach(idx => usedVerseIndices.add(idx));
    
    // Add matched verses
    reorderedVerses.push(...result.verses);
    
    console.log(`Order ${order}: Found ${result.verses.length}/${verseNumbers.length} verses for Chapter ${chapter}, Verses ${verseRange}, Type: ${type}`);
  }
  
  // Count actual verses (excluding section markers)
  const actualVerseCount = reorderedVerses.filter(v => v.verse || v.$).length;
  
  // Count total translations
  const totalTranslations = reorderedVerses.reduce((sum, verse) => {
    if (verse.translations?.[0]?.translation) {
      return sum + verse.translations[0].translation.length;
    }
    return sum;
  }, 0);
  
  // Create new XML structure
  const newXmlData = {
    story: {
      $: {
        query: xmlData.story.$.query,
        generated: new Date().toISOString()
      },
      metadata: [{
        title: [xmlData.story.metadata[0].title[0]],
        verses_count: [actualVerseCount.toString()],
        translations_count: [totalTranslations.toString()],
        reordered: [new Date().toISOString()],
        reorder_source: [path.basename(reorderCsvPath)]
      }],
      verses: [{
        verse: reorderedVerses.filter(v => v.$ || v.verse) // Only include verses, not section markers
      }]
    }
  };
  
  // Build XML
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '  ' }
  });
  const outputXml = builder.buildObject(newXmlData);
  
  // Write output
  fs.writeFileSync(outputXmlPath, outputXml, 'utf8');
  
  console.log(`\nSuccess! Reordered XML written to: ${outputXmlPath}`);
  console.log(`Total verses in output: ${actualVerseCount}`);
  console.log(`Total translations in output: ${totalTranslations}`);
  
  // Report unused verses from source XML
  const unusedVerses = [];
  allXmlVerses.forEach((verse, idx) => {
    if (!usedVerseIndices.has(idx)) {
      // Get first translation for preview
      const firstTranslation = verse.translations?.[0]?.translation?.[0];
      const author = firstTranslation?.$?.author || 'Unknown';
      const text = firstTranslation?.text?.[0] || '';
      
      unusedVerses.push({
        chapter: verse.$.chapter,
        verse: verse.$.verse,
        author: author,
        type: isQuranVerse(verse) ? 'quran' : 'hadith',
        text: text.substring(0, 80) + (text.length > 80 ? '...' : ''),
        translationCount: verse.translations?.[0]?.translation?.length || 0
      });
    }
  });
  
  if (unusedVerses.length > 0) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`UNUSED VERSES FROM SOURCE XML`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Total unused: ${unusedVerses.length} out of ${allXmlVerses.length} verses\n`);
    
    // Group by type
    const unusedQuran = unusedVerses.filter(v => v.type === 'quran');
    const unusedHadith = unusedVerses.filter(v => v.type === 'hadith');
    
    if (unusedQuran.length > 0) {
      console.log(`Unused Quran verses (${unusedQuran.length}):`);
      unusedQuran
        .sort((a, b) => {
          const chapterDiff = parseInt(a.chapter) - parseInt(b.chapter);
          return chapterDiff !== 0 ? chapterDiff : parseInt(a.verse) - parseInt(b.verse);
        })
        .forEach(v => {
          const translationInfo = v.translationCount > 0 ? ` [${v.translationCount} translations]` : '';
          console.log(`  ${v.chapter}:${v.verse} (${v.author})${translationInfo} - ${v.text}`);
        });
      console.log('');
    }
    
    if (unusedHadith.length > 0) {
      console.log(`Unused Hadith verses (${unusedHadith.length}):`);
      unusedHadith
        .sort((a, b) => {
          const chapterDiff = parseInt(a.chapter) - parseInt(b.chapter);
          return chapterDiff !== 0 ? chapterDiff : parseInt(a.verse) - parseInt(b.verse);
        })
        .forEach(v => {
          const translationInfo = v.translationCount > 0 ? ` [${v.translationCount} translations]` : '';
          console.log(`  ${v.chapter}:${v.verse} (${v.author})${translationInfo} - ${v.text}`);
        });
      console.log('');
    }
    
    console.log(`${'='.repeat(80)}`);
  } else {
    console.log(`\nAll verses from source XML were used in the output!`);
  }
}

// Run the script
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

