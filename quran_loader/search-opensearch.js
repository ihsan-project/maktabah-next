#!/usr/bin/env node

const { Client } = require('@opensearch-project/opensearch');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// OpenSearch client
const opensearchClient = new Client({
  node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
  auth: (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD)
    ? { username: process.env.OPENSEARCH_USERNAME, password: process.env.OPENSEARCH_PASSWORD }
    : undefined,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
});

// Bedrock client for embeddings
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

const EMBEDDING_MODEL_ID = 'cohere.embed-multilingual-v3';
const INDEX_NAME = 'kitaab';

// Parse CLI args
const args = process.argv.slice(2);
const queryArg = args.find(a => a.startsWith('--query='));
const authorArg = args.find(a => a.startsWith('--author='));
const titleArg = args.find(a => a.startsWith('--title='));
const modeArg = args.find(a => a.startsWith('--mode='));
const sizeArg = args.find(a => a.startsWith('--size='));
const debugFlag = args.includes('--debug');

const query = queryArg ? queryArg.split('=').slice(1).join('=').replace(/"/g, '') : null;
const author = authorArg ? authorArg.split('=').slice(1).join('=').replace(/"/g, '') : null;
const titleFilter = titleArg ? titleArg.split('=').slice(1).join('=').replace(/"/g, '') : null;
const mode = modeArg ? modeArg.split('=')[1].replace(/"/g, '') : 'all';
const size = sizeArg ? parseInt(sizeArg.split('=')[1], 10) : 5;

function usage() {
  console.log(`
Usage: node search-opensearch.js --query="search term" [options]

Options:
  --query="term"       Search query (required)
  --author="name"      Filter by author (e.g., "Arberry", "Ahmed Ali")
  --title="quran"      Filter by title ("quran" or "bukhari")
  --mode="all"         Search mode: keyword, semantic, hybrid, or all (default: all)
  --size=5             Number of results per search (default: 5)
  --debug              Show additional debug info (index stats, field values)

Examples:
  node search-opensearch.js --query="Allah" --mode=keyword
  node search-opensearch.js --query="mercy and compassion" --mode=semantic
  node search-opensearch.js --query="paradise" --mode=hybrid --author="Arberry"
  node search-opensearch.js --query="Allah" --debug
`);
}

async function generateQueryEmbedding(text) {
  const response = await bedrockClient.send(new InvokeModelCommand({
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

function buildFilters() {
  const filters = [];
  if (author) filters.push({ term: { author } });
  if (titleFilter) filters.push({ term: { title: titleFilter } });
  return filters;
}

function printHit(hit, i) {
  const src = hit._source;
  const score = hit._score !== null && hit._score !== undefined ? ` (score: ${hit._score.toFixed(4)})` : '';
  const vol = src.volume ? `, Vol ${src.volume}` : '';
  console.log(`  [${i + 1}] Ch ${src.chapter}:${src.verse} | ${src.author} | ${src.title}${vol}${score}`);
  const preview = src.text.length > 200 ? src.text.substring(0, 200) + '...' : src.text;
  console.log(`      ${preview}`);
}

async function keywordSearch() {
  console.log(`\n--- KEYWORD SEARCH: "${query}" ---`);
  const filters = buildFilters();
  const must = [{ match: { text: query } }];

  const body = {
    query: { bool: { must, filter: filters } },
    size,
  };

  const { body: result } = await opensearchClient.search({ index: INDEX_NAME, body });
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0;
  console.log(`Found ${total} matches`);
  result.hits.hits.forEach((hit, i) => printHit(hit, i));
  return result;
}

async function semanticSearch() {
  console.log(`\n--- SEMANTIC SEARCH: "${query}" ---`);
  console.log('Generating query embedding...');
  const embedding = await generateQueryEmbedding(query);

  const filters = buildFilters();

  // Use KNN with filter if filters exist
  let body;
  if (filters.length > 0) {
    body = {
      size,
      query: {
        bool: {
          must: [
            {
              knn: {
                text_embedding: {
                  vector: embedding,
                  k: size,
                },
              },
            },
          ],
          filter: filters,
        },
      },
    };
  } else {
    body = {
      size,
      query: {
        knn: {
          text_embedding: {
            vector: embedding,
            k: size,
          },
        },
      },
    };
  }

  const { body: result } = await opensearchClient.search({ index: INDEX_NAME, body });
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0;
  console.log(`Found ${total} matches`);
  result.hits.hits.forEach((hit, i) => printHit(hit, i));
  return result;
}

async function hybridSearch() {
  console.log(`\n--- HYBRID SEARCH: "${query}" ---`);
  console.log('Generating query embedding...');
  const embedding = await generateQueryEmbedding(query);

  const filters = buildFilters();

  const body = {
    size,
    query: {
      bool: {
        should: [
          { match: { text: { query, boost: 1.0 } } },
          {
            knn: {
              text_embedding: {
                vector: embedding,
                k: size,
              },
            },
          },
        ],
        minimum_should_match: 1,
        filter: filters,
      },
    },
  };

  const { body: result } = await opensearchClient.search({ index: INDEX_NAME, body });
  const total = typeof result.hits.total === 'number' ? result.hits.total : result.hits.total?.value || 0;
  console.log(`Found ${total} matches`);
  result.hits.hits.forEach((hit, i) => printHit(hit, i));
  return result;
}

async function showDebugInfo() {
  console.log('\n--- DEBUG INFO ---');

  // Index stats
  const { body: stats } = await opensearchClient.count({ index: INDEX_NAME });
  console.log(`Total documents in index "${INDEX_NAME}": ${stats.count}`);

  // Unique authors
  const { body: authorAgg } = await opensearchClient.search({
    index: INDEX_NAME,
    body: {
      size: 0,
      aggs: { authors: { terms: { field: 'author', size: 50 } } },
    },
  });
  console.log('\nAuthors indexed:');
  authorAgg.aggregations.authors.buckets.forEach(b => {
    console.log(`  - "${b.key}" (${b.doc_count} docs)`);
  });

  // Unique titles
  const { body: titleAgg } = await opensearchClient.search({
    index: INDEX_NAME,
    body: {
      size: 0,
      aggs: { titles: { terms: { field: 'title', size: 10 } } },
    },
  });
  console.log('\nTitles indexed:');
  titleAgg.aggregations.titles.buckets.forEach(b => {
    console.log(`  - "${b.key}" (${b.doc_count} docs)`);
  });

  // Check if embeddings exist
  const { body: embeddingCheck } = await opensearchClient.search({
    index: INDEX_NAME,
    body: {
      size: 1,
      query: { exists: { field: 'text_embedding' } },
    },
  });
  const embTotal = typeof embeddingCheck.hits.total === 'number'
    ? embeddingCheck.hits.total
    : embeddingCheck.hits.total?.value || 0;
  console.log(`\nDocuments with embeddings: ${embTotal}`);

  // Sample document
  const { body: sample } = await opensearchClient.search({
    index: INDEX_NAME,
    body: { size: 1 },
  });
  if (sample.hits.hits.length > 0) {
    const doc = sample.hits.hits[0]._source;
    console.log('\nSample document:');
    console.log(`  ID: ${sample.hits.hits[0]._id}`);
    console.log(`  author: "${doc.author}"`);
    console.log(`  title: "${doc.title}"`);
    console.log(`  book_id: "${doc.book_id}"`);
    console.log(`  chapter: ${doc.chapter}, verse: ${doc.verse}`);
    console.log(`  volume: ${doc.volume}`);
    console.log(`  has embedding: ${doc.text_embedding ? 'yes (' + doc.text_embedding.length + ' dims)' : 'no'}`);
    const preview = doc.text.length > 100 ? doc.text.substring(0, 100) + '...' : doc.text;
    console.log(`  text: "${preview}"`);
  }
}

async function main() {
  if (!query && !debugFlag) {
    usage();
    process.exit(1);
  }

  try {
    if (debugFlag) {
      await showDebugInfo();
    }

    if (!query) {
      return;
    }

    const modes = mode === 'all' ? ['keyword', 'semantic', 'hybrid'] : [mode];

    for (const m of modes) {
      switch (m) {
        case 'keyword':
          await keywordSearch();
          break;
        case 'semantic':
          await semanticSearch();
          break;
        case 'hybrid':
          await hybridSearch();
          break;
        default:
          console.error(`Unknown mode: ${m}. Use keyword, semantic, hybrid, or all.`);
      }
    }
  } catch (error) {
    console.error('Error:', error.message || error);
    if (error.meta?.body) {
      console.error('OpenSearch response:', JSON.stringify(error.meta.body, null, 2));
    }
  } finally {
    await opensearchClient.close();
  }
}

main().catch(console.error);
