const functions = require('firebase-functions');
const logger = require('firebase-functions/logger');
const { Client } = require('@elastic/elasticsearch');
const admin = require('firebase-admin');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// Helper function to ensure API key is properly formatted
function getApiKeyAuth(apiKey) {
  if (apiKey.includes(':') && !apiKey.match(/^[A-Za-z0-9+/=]+$/)) {
    return { apiKey: Buffer.from(apiKey).toString('base64') };
  }
  return { apiKey };
}

// Search function to query ElasticSearch
async function searchDocuments(query, page = 1, size = 10, author = null, chapter = null) {
  try {
    // Initialize ElasticSearch client with API key authentication using process.env
    const client = new Client({
      node: process.env.ELASTICSEARCH_URL,
      auth: {
        apiKey: process.env.ELASTICSEARCH_APIKEY
      },
      tls: {
        rejectUnauthorized: false // Set to true in production
      }
    });
    
    const startIndex = (page - 1) * size;
    
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
          // Search in the text.stem field for stemmed matches
          { 
            match: { 
              "text.stem": {
                query: query,
                boost: 1.2 // Give stemmed matches a higher boost
              }
            }
          },
          // Use the joined field for phrase-like queries and typo tolerance
          { 
            match: { 
              "text.joined": {
                query: query,
                boost: 1.5 // Higher boost for phrase matches
              }
            }
          },
          // Use prefix field for better search-as-you-type experience
          {
            match: {
              "text.prefix": {
                query: query,
                boost: 0.8 // Lower boost for prefix matches
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
        term: { "author.enum": author }
      });
    }
    
    // Add chapter filter if specified
    if (chapter) {
      searchQuery.bool.filter.push({
        term: { chapter: parseInt(chapter, 10) }
      });
    }
    
    // Perform the search
    const response = await client.search({
      index: elasticsearchIndex,
      body: {
        from: startIndex,
        size: size,
        query: searchQuery,
        highlight: {
          fields: {
            text: {
              pre_tags: ["<em>"],
              post_tags: ["</em>"],
              fragment_size: 150,
              number_of_fragments: 3
            }
          }
        },
        sort: [
          { _score: { order: "desc" } },
          { chapter: { order: "asc" } },
          { verse: { order: "asc" } }
        ]
      }
    });

    const hits = response.hits.hits;
    const total = typeof response.hits.total === 'number' 
      ? response.hits.total 
      : response.hits.total?.value || 0;
    
    const results = hits.map(hit => ({
      id: hit._id,
      score: hit._score || 0,
      ...hit._source,
      highlights: hit.highlight?.text || []
    }));

    return {
      results,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size)
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
  logger.info("mmi: 1")
  // Enable CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  logger.info("mmi: 2")
  
  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  logger.info("mmi: 3")
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  
  // We need to extract just the /{bookId}/{chapter}/{verse}.json part
  const path = req.path.replace(/^\/api\/storage\//, '');

  logger.info("mmi: 4", path)
  
  if (!path) {
    res.status(400).send('Invalid path');
    return;
  }
  
  try {
    // Get the file from Firebase Storage with explicit bucket name
    const bucket = admin.storage().bucket('maktabah-8ac04.firebasestorage.app');
    logger.info("mmi: 5")
    const file = bucket.file(path);
    logger.info("mmi: 6")
    
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
