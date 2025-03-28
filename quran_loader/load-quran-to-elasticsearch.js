#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Client } = require('@elastic/elasticsearch');
const { DOMParser } = require('@xmldom/xmldom');
const xpath = require('xpath');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node load-quran-to-elasticsearch.js <xml-file> --author="Author Name" --id="unique-identifier" [--title="quran|bukhari"] [--volume=1]');
  process.exit(1);
}

const xmlFile = args[0];
const authorArg = args.find(arg => arg.startsWith('--author='));
const author = authorArg 
  ? authorArg.split('=')[1].replace(/"/g, '') 
  : path.basename(xmlFile, path.extname(xmlFile));

// Parse ID parameter - optional unique identifier for this dataset
const idArg = args.find(arg => arg.startsWith('--id='));
const bookId = idArg
  ? idArg.split('=')[1].replace(/"/g, '')
  : `${author.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

// Parse title parameter - determine the title of the work (Quran or Bukhari, etc.)
const titleArg = args.find(arg => arg.startsWith('--title='));
const title = titleArg
  ? titleArg.split('=')[1].replace(/"/g, '')
  : 'auto'; // Auto-detect content type

// Parse volume parameter - optional volume number for multi-volume works
const volumeArg = args.find(arg => arg.startsWith('--volume='));
const volume = volumeArg
  ? parseInt(volumeArg.split('=')[1], 10)
  : null; // No volume by default

// Determine content type based on title or auto-detect
const contentType = title !== 'auto' ? 'auto' : 'auto';

// Initialize Elasticsearch client
const elasticClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  auth: process.env.ELASTICSEARCH_APIKEY 
    ? { apiKey: process.env.ELASTICSEARCH_APIKEY }
    : undefined,
  tls: {
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
});

// Index name - should match what's used in your application
const INDEX_NAME = 'kitaab';

/**
 * Detect content type (Quran or Hadith) based on XML content
 * @param {string} filePath Path to the XML file
 * @returns {string} 'quran' or 'hadith'
 */
function detectContentType(filePath) {
  try {
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Check for sura elements (Quran)
    const suras = xpath.select('//sura', doc);
    if (suras.length > 0) {
      return 'quran';
    }
    
    // Check for hadith elements
    const hadith = xpath.select('//hadith', doc);
    if (hadith.length > 0) {
      return 'hadith';
    }
    
    console.warn('Unable to detect content type from XML. Defaulting to "quran"');
    return 'quran';
  } catch (error) {
    console.error('Error detecting content type:', error);
    return 'quran'; // Default to quran in case of error
  }
}

/**
 * Parse Quran XML file and extract verse data
 * @param {string} filePath Path to the XML file
 * @param {string} author Name of the author
 * @param {string} bookId Book identifier
 * @returns {Array} Array of verse objects
 */
function parseQuranXML(filePath, author, bookId) {
  console.log(`Parsing Quran XML file: ${filePath}`);
  
  try {
    // Read and parse XML
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Extract all suras
    const suras = xpath.select('//sura', doc);
    const verses = [];
    
    // Process each sura
    suras.forEach(sura => {
      const suraIndex = parseInt(sura.getAttribute('index'));
      const suraName = sura.getAttribute('name') || '';
      
      // Extract all ayas in this sura
      const ayas = xpath.select('./aya', sura);
      
      // Process each aya
      ayas.forEach(aya => {
        const ayaIndex = parseInt(aya.getAttribute('index'));
        const text = aya.getAttribute('text') || '';
        
        if (suraIndex && ayaIndex && text) {
          verses.push({
            chapter: suraIndex,
            verse: ayaIndex,
            text: text,
            author: author,
            chapter_name: suraName,
            book_id: bookId,
            title: title === 'auto' ? 'quran' : title,
            volume: volume
          });
        }
      });
    });
    
    console.log(`Extracted ${verses.length} verses from ${suras.length} suras`);
    return verses;
  } catch (error) {
    console.error('Error parsing Quran XML file:', error);
    return [];
  }
}

/**
 * Parse Hadith XML file and extract verse data
 * @param {string} filePath Path to the XML file
 * @param {string} author Name of the author
 * @param {string} bookId Book identifier
 * @returns {Array} Array of verse objects
 */
function parseHadithXML(filePath, author, bookId) {
  console.log(`Parsing Hadith XML file: ${filePath}`);
  
  try {
    // Read and parse XML
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Extract hadith element and its name
    const hadithElement = xpath.select('//hadith', doc)[0];
    const hadithName = hadithElement ? hadithElement.getAttribute('name') || '' : '';
    
    // Extract all chapters
    const chapters = xpath.select('//chapter', doc);
    
    // Temporary storage to merge verses with the same index
    const verseMap = new Map(); // key: "chapter_verse", value: {chapter, verse, texts[]}
    
    // Process each chapter
    chapters.forEach(chapter => {
      const chapterIndex = parseInt(chapter.getAttribute('index'));
      
      // Extract all verses in this chapter
      const verses = xpath.select('./verse', chapter);
      
      // Process each verse
      verses.forEach(verse => {
        const verseIndex = parseInt(verse.getAttribute('index'));
        const text = verse.getAttribute('text') || '';
        
        if (chapterIndex && verseIndex) {
          // Create a unique key for this chapter-verse combination
          const key = `${chapterIndex}_${verseIndex}`;
          
          // Initialize or update verse in the map
          if (!verseMap.has(key)) {
            verseMap.set(key, {
              chapter: chapterIndex,
              verse: verseIndex,
              texts: [text],
              chapter_name: hadithName,
              author: author,
              book_id: bookId,
              title: title === 'auto' ? 'bukhari' : title,
              volume: volume
            });
          } else {
            // Add text to existing verse with newline separator
            verseMap.get(key).texts.push(text);
          }
        }
      });
    });
    
    // Convert the map to array and join texts with newlines
    const result = Array.from(verseMap.values()).map(item => {
      return {
        ...item,
        text: item.texts.join('\n'),
        texts: undefined // Remove the temporary array
      };
    });
    
    console.log(`Extracted ${result.length} merged verses from ${chapters.length} chapters`);
    return result;
  } catch (error) {
    console.error('Error parsing Hadith XML file:', error);
    return [];
  }
}

/**
 * Create Elasticsearch index with appropriate mappings
 */
async function createIndex() {
  try {
    const indexExists = await elasticClient.indices.exists({ index: INDEX_NAME });
    
    if (!indexExists) {
      console.log(`Creating index: ${INDEX_NAME}`);
      
      await elasticClient.indices.create({
        index: INDEX_NAME,
        body: {
          settings: {
            analysis: {
              analyzer: {
                arabic_analyzer: {
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "arabic_normalization", "arabic_stemmer"]
                },
                english_analyzer: {
                  type: "custom",
                  tokenizer: "standard",
                  filter: ["lowercase", "english_stemmer"]
                }
              },
              filter: {
                arabic_stemmer: {
                  type: "stemmer",
                  language: "arabic"
                },
                english_stemmer: {
                  type: "stemmer",
                  language: "english"
                }
              }
            },
            number_of_shards: 1,
            number_of_replicas: 0
          },
          mappings: {
            properties: {
              chapter: { type: "integer" },
              verse: { type: "integer" },
              text: { 
                type: "text",
                analyzer: "english_analyzer",
                fields: {
                  arabic: {
                    type: "text",
                    analyzer: "arabic_analyzer"
                  },
                  keyword: {
                    type: "keyword",
                    ignore_above: 256
                  }
                }
              },
              author: { type: "keyword" },
              chapter_name: { type: "keyword" },
              book_id: { 
                type: "keyword",
                index: false // Not searchable, just returned as metadata
              },
              title: { type: "keyword" }, // Added to store the work title (Quran, Bukhari, etc.)
              volume: { type: "integer" }  // Added to store the volume number
            }
          }
        }
      });
      
      console.log(`Index ${INDEX_NAME} created successfully`);
    } else {
      console.log(`Index ${INDEX_NAME} already exists`);
    }
  } catch (error) {
    console.error('Error creating index:', error);
    process.exit(1);
  }
}

/**
 * Index data to Elasticsearch in batches
 * @param {Array} verses Array of verse objects
 */
async function indexData(verses) {
  if (verses.length === 0) {
    console.log('No verses to index');
    return;
  }
  
  console.log(`Indexing ${verses.length} verses to Elasticsearch...`);
  
  try {
    // Process in batches to avoid memory issues with large datasets
    const BATCH_SIZE = 500;
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < verses.length; i += BATCH_SIZE) {
      const batch = verses.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(verses.length/BATCH_SIZE)}`);
      
      // Prepare bulk operations
      const operations = [];
      
      for (const verse of batch) {
        // Create a unique ID for each verse using chapter, verse, author, and volume if available
        let id = `${verse.chapter}_${verse.verse}_${verse.author.replace(/\s+/g, '_')}`;
        if (verse.volume !== null) {
          id += `_vol${verse.volume}`;
        }
        
        operations.push({ index: { _index: INDEX_NAME, _id: id } });
        operations.push(verse);
      }
      
      // Execute bulk operation
      const result = await elasticClient.bulk({ 
        refresh: true,
        operations: operations
      });
      
      if (result.errors) {
        console.error('Errors occurred during bulk indexing');
        const errorItems = result.items.filter(item => item.index && item.index.error);
        errorCount += errorItems.length;
        successCount += (batch.length - errorItems.length);
        
        // Log a sample of errors
        if (errorItems.length > 0) {
          console.error(`Sample error: ${JSON.stringify(errorItems[0].index.error)}`);
        }
      } else {
        successCount += batch.length;
      }
    }
    
    console.log(`Indexing complete: ${successCount} successful, ${errorCount} failed`);
  } catch (error) {
    console.error('Error indexing data:', error);
  }
}

/**
 * Test the search after indexing
 * @param {string} author Author name to search within
 * @param {string} bookId ID used for tracking
 * @param {string} contentType 'quran' or 'hadith'
 */
async function testSearch(author, bookId, contentType) {
  try {
    console.log('\nTesting search functionality...');
    
    // Search for a common term based on content type
    const searchTerm = contentType === 'hadith' ? 'Narrated' : 'Allah';
    const titleValue = title === 'auto' ? (contentType === 'quran' ? 'quran' : 'bukhari') : title;
    
    // Build query based on whether volume is specified
    const must = [
      { match: { text: searchTerm } },
      { term: { author: author } },
      { term: { title: titleValue } }
    ];
    
    // Add volume filter if provided
    if (volume !== null) {
      must.push({ term: { volume: volume } });
    }
    
    const result = await elasticClient.search({
      index: INDEX_NAME,
      body: {
        query: {
          bool: {
            must: must
          }
        },
        size: 5
      }
    });
    
    const hits = result.hits.hits;
    const totalHits = typeof result.hits.total === 'number' 
      ? result.hits.total 
      : result.hits.total?.value || 0;
    
    const volumeInfo = volume !== null ? `, Volume: ${volume}` : '';
    console.log(`Found ${totalHits} matches for "${searchTerm}" by ${author} (Book ID: ${bookId}, Title: ${titleValue}${volumeInfo}). Sample results:`);
    
    hits.forEach((hit, i) => {
      console.log(`\n[${i+1}] Chapter ${hit._source.chapter}, Verse ${hit._source.verse}:`);
      console.log(`Book ID: ${hit._source.book_id}`);
      // Truncate text for display
      const previewText = hit._source.text.length > 150 
        ? `${hit._source.text.substring(0, 150)}...` 
        : hit._source.text;
      console.log(previewText);
    });
  } catch (error) {
    console.error('Error testing search:', error);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Starting import process for ${author}'s translation (Book ID: ${bookId})`);
    if (volume !== null) {
      console.log(`Volume: ${volume}`);
    }
    
    // Check if file exists
    if (!fs.existsSync(xmlFile)) {
      console.error(`XML file not found: ${xmlFile}`);
      process.exit(1);
    }
    
    // Determine content type (Quran or Hadith)
    let detectedType = detectContentType(xmlFile);
    console.log(`Content type: ${detectedType}`);
    console.log(`Title: ${title === 'auto' ? (detectedType === 'quran' ? 'quran' : 'bukhari') : title}`);
    
    // Create index with mappings
    await createIndex();
    
    // Parse XML and extract verses based on content type
    let verses = [];
    if (detectedType === 'quran') {
      verses = parseQuranXML(xmlFile, author, bookId);
    } else if (detectedType === 'hadith') {
      verses = parseHadithXML(xmlFile, author, bookId);
    } else {
      console.error(`Unknown content type: ${detectedType}`);
      process.exit(1);
    }
    
    if (verses.length > 0) {
      // Index data to Elasticsearch
      await indexData(verses);
      
      // Test search functionality
      await testSearch(author, bookId, detectedType);
      
      console.log('\nImport completed successfully!');
    } else {
      console.error('No verses extracted from the XML file');
    }
  } catch (error) {
    console.error('Error in main process:', error);
  } finally {
    await elasticClient.close();
  }
}

// Run the main function
main().catch(console.error);
