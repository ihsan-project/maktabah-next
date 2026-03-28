const functions = require('firebase-functions');
const logger = require('firebase-functions/logger');
const { Client } = require('@opensearch-project/opensearch');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const admin = require('firebase-admin');
const { hashApiKey, generateRawApiKey } = require('./lib/api-key-auth');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const EMBEDDING_MODEL_ID = 'cohere.embed-multilingual-v3';

// Reuse clients across requests to avoid repeated TCP/TLS handshakes
let bedrockClient;
function getBedrockClient() {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return bedrockClient;
}

let opensearchClient;
function getOpenSearchClient() {
  if (!opensearchClient) {
    opensearchClient = new Client({
      node: process.env.OPENSEARCH_URL,
      auth: {
        username: process.env.OPENSEARCH_USERNAME,
        password: process.env.OPENSEARCH_PASSWORD
      },
      ssl: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
  }
  return opensearchClient;
}

/**
 * Generate embedding for a search query using Cohere via Bedrock
 * @param {string} text The query text to embed
 * @returns {Promise<number[]>} Embedding vector
 */
async function embedQuery(text) {
  const client = getBedrockClient();

  const response = await client.send(new InvokeModelCommand({
    modelId: EMBEDDING_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      texts: [text],
      input_type: 'search_query',
      truncate: 'END',
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embeddings[0];
}

/**
 * Deduplicate search hits by chapter-verse, keeping the highest scoring hit
 * @param {Array} hits Array of OpenSearch hit objects (must have _id, _score, _source)
 * @returns {Array} Deduplicated results
 */
function deduplicateResults(hits) {
  const seen = new Map();
  for (const hit of hits) {
    const s = hit._source;
    const key = `${s.chapter}_${s.verse}`;
    const score = hit._score || 0;
    if (!seen.has(key) || score > seen.get(key)._score) {
      seen.set(key, { ...hit, _score: score });
    }
  }
  return Array.from(seen.values()).map(hit => ({
    id: hit._id,
    score: hit._score || 0,
    ...hit._source,
  }));
}

/**
 * Merge two ranked result sets using Reciprocal Rank Fusion
 * @param {Array} textHits Hits from BM25 text search
 * @param {Array} knnHits Hits from KNN vector search
 * @param {number} k RRF constant (default 60)
 * @param {number} textWeight Weight for keyword/BM25 results (default 1.0)
 * @param {number} semanticWeight Weight for semantic/KNN results (default 1.5)
 * @returns {Array} Merged hits sorted by weighted RRF score
 */
function reciprocalRankFusion(textHits, knnHits, k = 60, textWeight = 1.0, semanticWeight = 1.5) {
  const scores = new Map();

  textHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) {
      scores.set(key, { score: 0, hit, sources: new Set() });
    }
    scores.get(key).score += textWeight * (1 / (k + rank + 1));
    scores.get(key).sources.add('keyword');
  });

  knnHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) {
      scores.set(key, { score: 0, hit, sources: new Set() });
    }
    scores.get(key).score += semanticWeight * (1 / (k + rank + 1));
    scores.get(key).sources.add('semantic');
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, hit, sources }) => {
      const source = sources.size === 2 ? 'both' : [...sources][0];
      return { ...hit, _score: score, _source: { ...hit._source, source } };
    });
}

/**
 * Fetch highlight fragments for a page of results using OpenSearch highlight API.
 * Runs a targeted query for just the document IDs on the current page.
 * @param {string} query The original search query
 * @param {Array} results Paginated result objects (must have .id)
 * @returns {Promise<Map<string, object>>} Map of doc ID → highlight fragments
 */
async function fetchHighlights(query, results) {
  if (!results.length || !query) return new Map();

  const client = getOpenSearchClient();
  const docIds = results.map(r => r.id);

  try {
    const response = await client.search({
      index: 'kitaab',
      body: {
        size: docIds.length,
        query: {
          bool: {
            must: {
              ids: { values: docIds }
            },
            should: [
              { match: { text: { query } } }
            ]
          }
        },
        highlight: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fields: {
            text: { fragment_size: 0, number_of_fragments: 0 }
          }
        },
        _source: false
      }
    });

    const highlightMap = new Map();
    for (const hit of response.body.hits.hits) {
      if (hit.highlight) {
        highlightMap.set(hit._id, hit.highlight);
      }
    }
    return highlightMap;
  } catch (error) {
    logger.warn('Highlight fetch failed, returning results without highlights:', error.message);
    return new Map();
  }
}

/**
 * Search documents using text, semantic, or hybrid mode
 */
async function searchDocuments(query, page = 1, size = 10, author = null, chapter = null, titles = null, mode = 'text') {
  try {
    const client = getOpenSearchClient();

    const opensearchIndex = 'kitaab';
    const from = (page - 1) * size;

    // Build filters (shared across all modes)
    const filters = [];
    if (author) {
      filters.push({ term: { "author": author } });
    }
    if (chapter) {
      filters.push({ term: { chapter: parseInt(chapter, 10) } });
    }
    if (titles) {
      const titleArray = Array.isArray(titles) ? titles : [titles];
      if (titleArray.length > 0) {
        filters.push({ terms: { title: titleArray } });
      }
    }

    let searchResult;

    if (mode === 'text') {
      // --- BM25 text search with aggregations (original behavior) ---
      const searchQuery = {
        bool: {
          should: [
            { match: { text: { query: query, boost: 1.0 } } },
            { match: { "text.arabic": { query: query, boost: 1.2 } } }
          ],
          minimum_should_match: 1,
          filter: filters
        }
      };

      const response = await client.search({
        index: opensearchIndex,
        body: {
          size: 0,
          query: searchQuery,
          aggs: {
            chapters: {
              terms: {
                field: "chapter",
                size: 1000,
                order: { _key: "asc" }
              },
              aggs: {
                verses: {
                  terms: {
                    field: "verse",
                    size: 1000,
                    order: { _key: "asc" }
                  },
                  aggs: {
                    top_hit: {
                      top_hits: {
                        size: 1,
                        sort: [{ _score: { order: "desc" } }]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      const chapterBuckets = response.body.aggregations.chapters.buckets || [];
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

      const totalResults = allResults.length;
      const paginatedResults = allResults.slice(from, from + size);

      searchResult = {
        results: paginatedResults,
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };

    } else if (mode === 'semantic') {
      // --- Pure KNN vector search ---
      const embedding = await embedQuery(query);

      const knnClause = {
        knn: {
          text_embedding: {
            vector: embedding,
            k: 100,
          },
        },
      };

      const finalQuery = filters.length > 0
        ? { bool: { must: knnClause, filter: filters } }
        : knnClause;

      const response = await client.search({
        index: opensearchIndex,
        body: { size: 100, query: finalQuery },
      });

      const allResults = deduplicateResults(response.body.hits.hits);
      const totalResults = allResults.length;
      const paginatedResults = allResults.slice(from, from + size);

      searchResult = {
        results: paginatedResults,
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };

    } else if (mode === 'hybrid') {
      // --- Hybrid: BM25 + KNN merged with Reciprocal Rank Fusion ---
      const embedding = await embedQuery(query);

      const textQuery = {
        bool: {
          should: [
            { match: { text: { query: query, boost: 1.0 } } },
            { match: { "text.arabic": { query: query, boost: 1.2 } } }
          ],
          minimum_should_match: 1,
          filter: filters
        }
      };

      const knnClause = {
        knn: {
          text_embedding: {
            vector: embedding,
            k: 100,
          },
        },
      };

      const knnQuery = filters.length > 0
        ? { bool: { must: knnClause, filter: filters } }
        : knnClause;

      // Run both queries in parallel
      const [textResponse, knnResponse] = await Promise.all([
        client.search({
          index: opensearchIndex,
          body: { size: 100, query: textQuery },
        }),
        client.search({
          index: opensearchIndex,
          body: { size: 100, query: knnQuery },
        }),
      ]);

      const mergedHits = reciprocalRankFusion(
        textResponse.body.hits.hits,
        knnResponse.body.hits.hits
      );

      const allResults = deduplicateResults(mergedHits);
      const totalResults = allResults.length;
      const paginatedResults = allResults.slice(from, from + size);

      searchResult = {
        results: paginatedResults,
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };
    } else {
      // Fallback — shouldn't reach here
      return { results: [], total: 0, page, size, totalPages: 0, hasMore: false };
    }

    // Fetch highlights for the current page of results
    const highlightMap = await fetchHighlights(query, searchResult.results);
    searchResult.results = searchResult.results.map(result => {
      const hl = highlightMap.get(result.id);
      if (hl) {
        result.highlight = hl;
      }
      return result;
    });

    return searchResult;
  } catch (error) {
    logger.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}

// Create a function to handle API requests
exports.nextApiHandler = functions.https.onRequest(
  { secrets: ['OPENSEARCH_URL', 'OPENSEARCH_USERNAME', 'OPENSEARCH_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'] },
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
          const titles = req.query['title'] || req.query['title[]'] || null;
          const mode = req.query.mode || 'hybrid'; // 'text', 'semantic', or 'hybrid'

          // Validate the query
          if (!query) {
            res.status(400).json({ error: 'Missing search query parameter (q)' });
            return;
          }

          // Validate mode
          if (!['text', 'semantic', 'hybrid'].includes(mode)) {
            res.status(400).json({ error: 'Invalid mode. Use "text", "semantic", or "hybrid".' });
            return;
          }

          // Search documents
          const searchResults = await searchDocuments(query, page, size, author, chapter, titles, mode);

          // Only include source debug info when explicitly requested
          if (req.query.debug !== 'true') {
            searchResults.results = searchResults.results.map(({ source, ...rest }) => rest);
          }

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
// --- API Key Management (callable functions) ---

/**
 * Generate a new MCP API key for the authenticated user.
 * Stores a hashed version in apiKeys/{hash} for fast lookup,
 * and a reference in users/{uid}/apiKeys/{keyId} for listing.
 */
exports.generateApiKey = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to generate an API key');
  }

  const uid = context.auth.uid;
  const name = (data.name || '').trim();
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', 'API key name is required');
  }
  if (name.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', 'API key name must be 100 characters or less');
  }

  const db = admin.firestore();

  // Enforce a max of 5 active keys per user
  const existingKeys = await db.collection('users').doc(uid).collection('apiKeys')
    .where('status', '==', 'active').get();
  if (existingKeys.size >= 5) {
    throw new functions.https.HttpsError('resource-exhausted', 'Maximum of 5 active API keys allowed');
  }

  const rawKey = generateRawApiKey();
  const keyHash = hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 7) + '...' + rawKey.slice(-4);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = db.batch();

  // Lookup doc: apiKeys/{hash} — used by auth middleware
  batch.set(db.collection('apiKeys').doc(keyHash), {
    uid,
    name,
    keyPrefix,
    createdAt: now,
    lastUsedAt: null,
    requestCount: 0,
    rateLimit: 30,
    status: 'active',
  });

  // User's key reference: users/{uid}/apiKeys/{hash} — used for listing
  batch.set(db.collection('users').doc(uid).collection('apiKeys').doc(keyHash), {
    keyPrefix,
    name,
    createdAt: now,
    status: 'active',
  });

  await batch.commit();

  // Return the raw key ONCE — it can never be retrieved again
  return { key: rawKey, keyId: keyHash, name, keyPrefix };
});

/**
 * Revoke an API key. Sets status to 'revoked' in both collections.
 */
exports.revokeApiKey = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const uid = context.auth.uid;
  const keyId = data.keyId;
  if (!keyId) {
    throw new functions.https.HttpsError('invalid-argument', 'keyId is required');
  }

  const db = admin.firestore();

  // Verify the key belongs to this user
  const keyDoc = await db.collection('apiKeys').doc(keyId).get();
  if (!keyDoc.exists || keyDoc.data().uid !== uid) {
    throw new functions.https.HttpsError('not-found', 'API key not found');
  }

  if (keyDoc.data().status === 'revoked') {
    throw new functions.https.HttpsError('failed-precondition', 'API key is already revoked');
  }

  const batch = db.batch();
  batch.update(db.collection('apiKeys').doc(keyId), { status: 'revoked' });
  batch.update(db.collection('users').doc(uid).collection('apiKeys').doc(keyId), { status: 'revoked' });
  await batch.commit();

  return { success: true };
});

/**
 * List all API keys for the authenticated user.
 */
exports.listApiKeys = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const uid = context.auth.uid;
  const db = admin.firestore();

  const snapshot = await db.collection('users').doc(uid).collection('apiKeys')
    .orderBy('createdAt', 'desc').get();

  const keys = snapshot.docs.map(doc => ({
    keyId: doc.id,
    ...doc.data(),
    createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
  }));

  return { keys };
});

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
