#!/usr/bin/env node

const { Client } = require('@elastic/elasticsearch');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node generate-story.js <search-query> [--author="Author Name"] [--chapter=1] [--output="output.xml"]');
  process.exit(1);
}

const query = args[0];

// Parse optional parameters
const authorArg = args.find(arg => arg.startsWith('--author='));
const author = authorArg 
  ? authorArg.split('=')[1].replace(/"/g, '') 
  : null;

const chapterArg = args.find(arg => arg.startsWith('--chapter='));
const chapter = chapterArg
  ? chapterArg.split('=')[1].replace(/"/g, '')
  : null;

// Parse output file parameter
const outputArg = args.find(arg => arg.startsWith('--output='));
const outputFile = outputArg
  ? outputArg.split('=')[1].replace(/"/g, '')
  : `story-${Date.now()}.xml`;

/**
 * Search function to query ElasticSearch
 * @param {string} query The search term to look for
 * @param {string|null} author Optional author filter
 * @param {string|null} chapter Optional chapter filter
 * @returns {Promise<Object>} Search results
 */
async function searchDocuments(query, author = null, chapter = null) {
  try {
    // Initialize ElasticSearch client with API key authentication using process.env
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      auth: process.env.ELASTICSEARCH_APIKEY 
        ? { apiKey: process.env.ELASTICSEARCH_APIKEY } 
        : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
    
    // Hardcoded index name
    const elasticsearchIndex = 'kitaab';
    
    // Build the search query based on the mapping
    const searchQuery = {
      bool: {
        should: [
          // Search in the main text field with the base analyzer
          { 
            match: { 
              text: {
                query: query,
                boost: 1.0
              }
            }
          },
          // Search in the text.arabic field for Arabic-specific matches
          { 
            match: { 
              "text.arabic": {
                query: query,
                boost: 1.2 // Give Arabic-specific matches a higher boost
              }
            }
          },
          // Use a prefix query for better partial matching
          {
            prefix: {
              "text.keyword": {
                value: query,
                boost: 0.5 // Lower boost for prefix matches
              }
            }
          }
        ],
        minimum_should_match: 1,
        filter: [] // Will add filters here if needed
      }
    };
    
    // Add author filter if specified
    if (author) {
      searchQuery.bool.filter.push({
        term: { author: author }
      });
    }
    
    // Add chapter filter if specified
    if (chapter) {
      searchQuery.bool.filter.push({
        term: { chapter: parseInt(chapter, 10) }
      });
    }
    
    console.log(`Searching for "${query}"${author ? ` by ${author}` : ''}${chapter ? ` in chapter ${chapter}` : ''}...`);
    
    // Execute the search against Elasticsearch
    const response = await client.search({
      index: elasticsearchIndex,
      body: {
        from: 0,
        size: 1000, // Get up to 1000 results (adjust as needed)
        query: searchQuery,
        sort: [
          { _score: { order: "desc" } },
          { chapter: { order: "asc" } },
          { verse: { order: "asc" } }
        ],
        aggs: {
          unique_chapter_verse: {
            terms: {
              // Create a composite key using chapter and verse
              script: {
                source: "doc['chapter'].value + '_' + doc['verse'].value"
              },
              size: 10000 // Adjust based on expected number of unique combinations
            },
            aggs: {
              top_hit: {
                top_hits: {
                  size: 1
                }
              }
            }
          }
        }
      }
    });
    
    // Aggregated buckets for unique chapter/verse combinations
    const buckets = response.aggregations.unique_chapter_verse.buckets;
    const hits = buckets.map(bucket => bucket.top_hit.hits.hits[0]);
    const total = buckets.length;
    
    const results = hits.map(hit => ({
      id: hit._id,
      score: hit._score || 0,
      ...hit._source,
    }));

    return {
      results,
      total
    };
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}

/**
 * Escape XML special characters
 * @param {string} unsafe Input string that might contain XML special characters
 * @returns {string} Escaped string safe for XML
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate XML from search results
 * @param {Array} results Search results array
 * @param {string} searchQuery The original search query
 * @param {string} outputFile Path to save the XML file
 */
function generateXml(results, searchQuery, outputFile) {
  // Start building XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += `<story query="${escapeXml(searchQuery)}" generated="${new Date().toISOString()}">\n`;
  
  // Add metadata
  xml += '  <metadata>\n';
  xml += `    <title>Story generated from search: "${escapeXml(searchQuery)}"</title>\n`;
  xml += `    <verses_count>${results.length}</verses_count>\n`;
  xml += '  </metadata>\n\n';
  
  // Add the verses
  xml += '  <verses>\n';
  
  results.forEach((result) => {
    xml += `    <verse chapter="${result.chapter}" verse="${result.verse}" author="${escapeXml(result.author)}">\n`;
    xml += `      <chapter_name>${escapeXml(result.chapter_name || '')}</chapter_name>\n`;
    xml += `      <book_id>${escapeXml(result.book_id || '')}</book_id>\n`;
    xml += `      <score>${result.score}</score>\n`;
    xml += `      <text>${escapeXml(result.text)}</text>\n`;
    xml += '    </verse>\n';
  });
  
  xml += '  </verses>\n';
  xml += '</story>';
  
  // Write to file
  fs.writeFileSync(outputFile, xml);
  console.log(`XML story generated and saved to ${outputFile}`);
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Generating story from search term: "${query}"`);
    
    // Search documents
    const searchResults = await searchDocuments(query, author, chapter);
    
    console.log(`Found ${searchResults.total} results. Generating XML...`);
    
    // Generate XML with the results
    generateXml(searchResults.results, query, outputFile);
    
    // Display summary
    console.log(`\nStory generation summary:`);
    console.log(`- Search term: "${query}"`);
    if (author) console.log(`- Author filter: ${author}`);
    if (chapter) console.log(`- Chapter filter: ${chapter}`);
    console.log(`- Verses included: ${searchResults.total}`);
    console.log(`- Output file: ${outputFile}`);
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
