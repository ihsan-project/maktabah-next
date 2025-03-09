const functions = require('firebase-functions');
const { Client } = require('@elastic/elasticsearch');

// Search function to query ElasticSearch
async function searchDocuments(query, page = 1, size = 10) {
  try {
    // Initialize ElasticSearch client with config values
    const config = functions.config();
    const client = new Client({
      node: config.elasticsearch.url,
      auth: {
        username: config.elasticsearch.username,
        password: config.elasticsearch.password
      },
      tls: {
        rejectUnauthorized: false // Set to true in production
      }
    });
    
    const startIndex = (page - 1) * size;
    
    const response = await client.search({
      index: config.elasticsearch.index,
      body: {
        from: startIndex,
        size: size,
        query: {
          multi_match: {
            query: query,
            fields: ['title^2', 'content', 'author', 'tags'],
            fuzziness: 'AUTO'
          }
        },
        highlight: {
          fields: {
            title: {},
            content: {}
          }
        }
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
      highlights: hit.highlight || {}
    }));

    return {
      results,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size)
    };
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}

// Create a function to handle API requests
exports.nextApiHandler = functions.https.onRequest(async (req, res) => {
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

        // Validate the query
        if (!query) {
          res.status(400).json({ error: 'Missing search query parameter (q)' });
          return;
        }

        // Search documents
        const searchResults = await searchDocuments(query, page, size);
        res.json(searchResults);
        return;
      }
    }

    // Handle 404 for any other API routes
    res.status(404).json({ error: 'API endpoint not found' });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
