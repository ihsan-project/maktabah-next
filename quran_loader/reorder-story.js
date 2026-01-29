#!/usr/bin/env node

/**
 * Script to reorder story XML based on a CSV specification
 * 
 * Usage:
 *   node reorder-story.js <input-xml> <reorder-csv> <output-xml>
 * 
 * Example:
 *   node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml
 */

const fs = require('fs');
const path = require('path');
const xml2js = require('xml2js');
const { parse } = require('csv-parse/sync');

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
 * Find matching verses in the XML data
 */
function findMatchingVerses(xmlVerses, chapter, verseNumbers, type) {
  const matchedVerses = [];
  const isQuran = type.toLowerCase() === 'quran';
  
  for (const verseNum of verseNumbers) {
    const match = xmlVerses.find(v => {
      const xmlChapter = parseInt(v.$.chapter);
      const xmlVerse = parseInt(v.$.verse);
      const xmlIsQuran = isQuranVerse(v);
      
      return xmlChapter === chapter && 
             xmlVerse === verseNum && 
             xmlIsQuran === isQuran;
    });
    
    if (match) {
      matchedVerses.push(match);
    } else {
      console.warn(`Warning: Could not find verse - Chapter ${chapter}, Verse ${verseNum}, Type: ${type}`);
    }
  }
  
  return matchedVerses;
}

/**
 * Main function
 */
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.error('Usage: node reorder-story.js <input-xml> <reorder-csv> <output-xml>');
    console.error('Example: node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml');
    process.exit(1);
  }
  
  const [inputXmlPath, reorderCsvPath, outputXmlPath] = args;
  
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
    const matchedVerses = findMatchingVerses(allXmlVerses, chapter, verseNumbers, type);
    
    // Add matched verses
    reorderedVerses.push(...matchedVerses);
    
    console.log(`Order ${order}: Found ${matchedVerses.length}/${verseNumbers.length} verses for Chapter ${chapter}, Verses ${verseRange}, Type: ${type}`);
  }
  
  // Count actual verses (excluding section markers)
  const actualVerseCount = reorderedVerses.filter(v => v.verse || v.$).length;
  
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
}

// Run the script
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

