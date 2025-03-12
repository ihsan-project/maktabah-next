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
  console.error('Usage: node load-quran-to-elasticsearch.js <xml-file> --translator="Translator Name"');
  process.exit(1);
}

const xmlFile = args[0];
const translatorArg = args.find(arg => arg.startsWith('--translator='));
const translator = translatorArg 
  ? translatorArg.split('=')[1].replace(/"/g, '') 
  : path.basename(xmlFile, path.extname(xmlFile));

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
const INDEX_NAME = 'maktabah';

/**
 * Parse XML file and extract verse data
 * @param {string} filePath Path to the XML file
 * @param {string} translator Name of the translator
 * @returns {Array} Array of verse objects
 */
function parseXML(filePath, translator) {
  console.log(`Parsing XML file: ${filePath}`);
  
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
            translator: translator,
            chapter_name: suraName
          });
        }
      });
    });
    
    console.log(`Extracted ${verses.length} verses from ${suras.length} suras`);
    return verses;
  } catch (error) {
    console.error('Error parsing XML file:', error);
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
              translator: { type: "keyword" },
              chapter_name: { type: "keyword" }
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
        // Create a unique ID for each verse using chapter, verse, and translator
        const id = `${verse.chapter}_${verse.verse}_${verse.translator.replace(/\s+/g, '_')}`;
        
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
 * @param {string} translator Translator name to search within
 */
async function testSearch(translator) {
  try {
    console.log('\nTesting search functionality...');
    
    // Search for a common term
    const searchTerm = 'Allah';
    
    const result = await elasticClient.search({
      index: INDEX_NAME,
      body: {
        query: {
          bool: {
            must: [
              { match: { text: searchTerm } },
              { term: { translator: translator } }
            ]
          }
        },
        size: 5
      }
    });
    
    const hits = result.hits.hits;
    const totalHits = typeof result.hits.total === 'number' 
      ? result.hits.total 
      : result.hits.total?.value || 0;
      
    console.log(`Found ${totalHits} matches for "${searchTerm}" by ${translator}. Sample results:`);
    
    hits.forEach((hit, i) => {
      console.log(`\n[${i+1}] Chapter ${hit._source.chapter}, Verse ${hit._source.verse}:`);
      console.log(`${hit._source.text.substring(0, 150)}${hit._source.text.length > 150 ? '...' : ''}`);
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
    console.log(`Starting import process for ${translator}'s translation`);
    
    // Check if file exists
    if (!fs.existsSync(xmlFile)) {
      console.error(`XML file not found: ${xmlFile}`);
      process.exit(1);
    }
    
    // Create index with mappings
    await createIndex();
    
    // Parse XML and extract verses
    const verses = parseXML(xmlFile, translator);
    
    if (verses.length > 0) {
      // Index data to Elasticsearch
      await indexData(verses);
      
      // Test search functionality
      await testSearch(translator);
      
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
