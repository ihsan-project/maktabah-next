const logger = require('firebase-functions/logger');
const { Client } = require('@opensearch-project/opensearch');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const EMBEDDING_MODEL_ID = 'cohere.embed-multilingual-v3';
const OPENSEARCH_INDEX = 'kitaab';

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
      index: OPENSEARCH_INDEX,
      body: {
        size: docIds.length,
        query: {
          bool: {
            must: { ids: { values: docIds } },
            should: [{ match: { text: { query } } }]
          }
        },
        highlight: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fields: { text: { fragment_size: 0, number_of_fragments: 0 } }
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
    logger.warn('Highlight fetch failed:', error.message);
    return new Map();
  }
}

/**
 * Search documents using text, semantic, or hybrid mode
 * @param {string} query Search query
 * @param {object} opts Options: page, size, author, chapter, titles, mode
 * @returns {Promise<object>} Search results with pagination
 */
async function searchDocuments(query, { page = 1, size = 10, author = null, chapter = null, titles = null, mode = 'hybrid' } = {}) {
  try {
    const client = getOpenSearchClient();
    const from = (page - 1) * size;

    // Build filters
    const filters = [];
    if (author) filters.push({ term: { author } });
    if (chapter) filters.push({ term: { chapter: parseInt(chapter, 10) } });
    if (titles) {
      const titleArray = Array.isArray(titles) ? titles : [titles];
      if (titleArray.length > 0) filters.push({ terms: { title: titleArray } });
    }

    let searchResult;

    if (mode === 'text') {
      const searchQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { "text.arabic": { query, boost: 1.2 } } }
          ],
          minimum_should_match: 1,
          filter: filters
        }
      };

      const response = await client.search({
        index: OPENSEARCH_INDEX,
        body: {
          size: 0,
          query: searchQuery,
          aggs: {
            chapters: {
              terms: { field: "chapter", size: 1000, order: { _key: "asc" } },
              aggs: {
                verses: {
                  terms: { field: "verse", size: 1000, order: { _key: "asc" } },
                  aggs: {
                    top_hit: { top_hits: { size: 1, sort: [{ _score: { order: "desc" } }] } }
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
        (chapterBucket.verses.buckets || []).forEach(verseBucket => {
          const topHit = verseBucket.top_hit.hits.hits[0];
          allResults.push({ id: topHit._id, score: topHit._score || 0, ...topHit._source });
        });
      });

      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults, page, size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };

    } else if (mode === 'semantic') {
      const embedding = await embedQuery(query);
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const finalQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const response = await client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: finalQuery } });
      const allResults = deduplicateResults(response.body.hits.hits);
      const totalResults = allResults.length;

      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults, page, size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };

    } else if (mode === 'hybrid') {
      const embedding = await embedQuery(query);
      const textQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { "text.arabic": { query, boost: 1.2 } } }
          ],
          minimum_should_match: 1,
          filter: filters
        }
      };
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const knnQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const [textResponse, knnResponse] = await Promise.all([
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: textQuery } }),
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: knnQuery } }),
      ]);

      const mergedHits = reciprocalRankFusion(textResponse.body.hits.hits, knnResponse.body.hits.hits);
      const allResults = deduplicateResults(mergedHits);
      const totalResults = allResults.length;

      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults, page, size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults
      };
    } else {
      return { results: [], total: 0, page, size, totalPages: 0, hasMore: false };
    }

    // Fetch highlights
    const highlightMap = await fetchHighlights(query, searchResult.results);
    searchResult.results = searchResult.results.map(result => {
      const hl = highlightMap.get(result.id);
      if (hl) result.highlight = hl;
      return result;
    });

    return searchResult;
  } catch (error) {
    logger.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}

/**
 * Look up specific documents by chapter + verse in OpenSearch.
 * @param {object} filters Term filters to apply
 * @param {number} size Max results to return
 * @returns {Promise<Array>} Matching documents
 */
async function lookupDocuments(filters, size = 50) {
  const client = getOpenSearchClient();
  const response = await client.search({
    index: OPENSEARCH_INDEX,
    body: {
      size,
      query: { bool: { filter: filters } },
      sort: [{ author: 'asc' }],
    }
  });
  return response.body.hits.hits.map(hit => ({ id: hit._id, ...hit._source }));
}

module.exports = {
  searchDocuments,
  lookupDocuments,
  getOpenSearchClient,
  getBedrockClient,
  embedQuery,
  deduplicateResults,
  reciprocalRankFusion,
  fetchHighlights,
  OPENSEARCH_INDEX,
};
