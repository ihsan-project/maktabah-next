const functions = require('firebase-functions');
const logger = require('firebase-functions/logger');
const { Client } = require('@elastic/elasticsearch');
const admin = require('firebase-admin');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Search function to query ElasticSearch with terms aggregation partitioning
async function searchDocuments(query, page = 1, size = 10, author = null, chapter = null) {
  try {
    // Initialize ElasticSearch client with API key authentication
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      auth: {
        apiKey: process.env.ELASTICSEARCH_APIKEY
      },
      tls: {
        rejectUnauthorized: false // Set to true in production
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
          // Search in the text.arabic field for Arabic matches
          { 
            match: { 
              "text.arabic": {
                query: query,
                boost: 1.2
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
        term: { "author": author }
      });
    }
    
    // Add chapter filter if specified
    if (chapter) {
      searchQuery.bool.filter.push({
        term: { chapter: parseInt(chapter, 10) }
      });
    }
    
    // Calculate from and size for pagination
    const from = (page - 1) * size;
    
    // First, get all matching documents with their chapter-verse combinations
    // This approach finds all matching documents and groups them by chapter-verse
    const response = await client.search({
      index: elasticsearchIndex,
      body: {
        size: 0, // We don't need the documents at this stage, just the aggregation
        query: searchQuery,
        aggs: {
          chapters: {
            terms: {
              field: "chapter",
              size: 1000, // Get all chapters (max 114 for Quran)
              order: { _key: "asc" }
            },
            aggs: {
              verses: {
                terms: {
                  field: "verse",
                  size: 1000, // Reasonable number for verses
                  order: { _key: "asc" }
                },
                aggs: {
                  top_hit: {
                    top_hits: {
                      size: 1,
                      sort: [
                        { _score: { order: "desc" } }
                      ]
                    }
                  }
                }
              }
            }
          }
        }
      }
    });
    
    // Process the nested aggregation results
    const chapterBuckets = response.aggregations.chapters.buckets || [];
    
    // Flatten the structure to get a single array of verse results
    let allResults = [];
    
    chapterBuckets.forEach(chapterBucket => {
      const verseBuckets = chapterBucket.verses.buckets || [];
      
      verseBuckets.forEach(verseBucket => {
        const topHit = verseBucket.top_hit.hits.hits[0];
        
        allResults.push({
          id: topHit._id,
          score: topHit._score || 0,
          ...topHit._source
        });
      });
    });
    
    // Apply pagination to the flattened results
    const totalResults = allResults.length;
    const paginatedResults = allResults.slice(from, from + size);
    
    return {
      results: paginatedResults,
      total: totalResults,
      page,
      size,
      totalPages: Math.ceil(totalResults / size),
      hasMore: from + size < totalResults
    };
  } catch (error) {
    logger.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}

// Create a function to handle API requests
exports.nextApiHandler = functions.https.onRequest(
  { secrets: ['ELASTICSEARCH_URL', 'ELASTICSEARCH_APIKEY'] },
  async (req, res) => {
    // Set CORS headers
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      // Handle /api/search route
      if (req.path.startsWith('/api/search')) {
        if (req.method === 'GET') {
          const query = req.query.q;
          const page = parseInt(req.query.page || '1', 10);
          const size = parseInt(req.query.size || '10', 10);
          const author = req.query.author || null;
          const chapter = req.query.chapter || null;

          // Validate the query
          if (!query) {
            res.status(400).json({ error: 'Missing search query parameter (q)' });
            return;
          }

          // Search documents
          const searchResults = await searchDocuments(query, page, size, author, chapter);
          res.json(searchResults);
          return;
        }
      }

      // Handle 404 for any other API routes
      res.status(404).json({ error: 'API endpoint not found' });
    } catch (error) {
      logger.error('API error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * Firebase Function to proxy requests to Firebase Storage
 * This avoids CORS issues by serving the files through your own domain
 */
exports.proxyStorage = functions.https.onRequest(async (req, res) => {
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  
  // We need to extract just the /{bookId}/{chapter}/{verse}.json part
  const path = req.path.replace(/^\/api\/storage\//, '');
  
  if (!path) {
    res.status(400).send('Invalid path');
    return;
  }
  
  try {
    // Get the file from Firebase Storage with explicit bucket name
    const bucket = admin.storage().bucket('maktabah-8ac04.firebasestorage.app');
    const file = bucket.file(path);
    
    // Check if the file exists
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send('File not found');
      return;
    }
    
    // Download the file
    const [fileContent] = await file.download();
    
    // Send the file content with appropriate headers
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(fileContent);
  } catch (error) {
    logger.error('Error proxying file from Storage:', error);
    res.status(500).send('Error fetching file');
  }
});
