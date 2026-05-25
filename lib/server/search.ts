import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws-v3';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const EMBEDDING_MODEL_ID = 'cohere.embed-multilingual-v3';
const OPENSEARCH_INDEX = 'kitaab';

let bedrockClient: BedrockRuntimeClient | undefined;
function getBedrockClient(): BedrockRuntimeClient {
  if (!bedrockClient) {
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)');
    }
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return bedrockClient;
}

let opensearchClient: Client | undefined;
function getOpenSearchClient(): Client {
  if (!opensearchClient) {
    if (!process.env.OPENSEARCH_URL) {
      throw new Error('OPENSEARCH_URL is not configured');
    }
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)');
    }
    opensearchClient = new Client({
      ...AwsSigv4Signer({
        region: process.env.AWS_REGION || 'us-east-1',
        service: 'es',
        getCredentials: () =>
          Promise.resolve({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
          }),
      }),
      node: process.env.OPENSEARCH_URL as string,
    });
  }
  return opensearchClient;
}

async function embedQuery(text: string): Promise<number[]> {
  const client = getBedrockClient();
  const response = await client.send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        texts: [text],
        input_type: 'search_query',
        truncate: 'END',
      }),
    })
  );
  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.embeddings[0];
}

function deduplicateResults(hits: any[]): any[] {
  const seen = new Map<string, any>();
  for (const hit of hits) {
    const s = hit._source;
    const key = `${s.title || 'unknown'}_${s.volume != null ? s.volume : 'noVolume'}_${s.chapter}_${s.verse}`;
    const score = hit._score || 0;
    if (!seen.has(key) || score > seen.get(key)._score) {
      seen.set(key, { ...hit, _score: score });
    }
  }
  return Array.from(seen.values()).map((hit) => ({
    id: hit._id,
    score: hit._score || 0,
    ...hit._source,
  }));
}

function reciprocalRankFusion(
  textHits: any[],
  knnHits: any[],
  k = 60,
  textWeight = 1.0,
  semanticWeight = 1.5
): any[] {
  const scores = new Map<string, { score: number; hit: any; sources: Set<string> }>();

  textHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) scores.set(key, { score: 0, hit, sources: new Set() });
    const entry = scores.get(key)!;
    entry.score += textWeight * (1 / (k + rank + 1));
    entry.sources.add('keyword');
  });

  knnHits.forEach((hit, rank) => {
    const key = hit._id;
    if (!scores.has(key)) scores.set(key, { score: 0, hit, sources: new Set() });
    const entry = scores.get(key)!;
    entry.score += semanticWeight * (1 / (k + rank + 1));
    entry.sources.add('semantic');
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ score, hit, sources }) => {
      const source = sources.size === 2 ? 'both' : Array.from(sources)[0];
      return { ...hit, _score: score, _source: { ...hit._source, source } };
    });
}

async function fetchHighlights(query: string, results: any[]): Promise<Map<string, any>> {
  if (!results.length || !query) return new Map();
  const client = getOpenSearchClient();
  const docIds = results.map((r) => r.id);
  try {
    const response = await client.search({
      index: OPENSEARCH_INDEX,
      body: {
        size: docIds.length,
        query: {
          bool: {
            must: { ids: { values: docIds } },
            should: [{ match: { text: { query } } }],
          },
        },
        highlight: {
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
          fields: { text: { fragment_size: 0, number_of_fragments: 0 } },
        },
        _source: false,
      },
    });
    const highlightMap = new Map<string, any>();
    for (const hit of (response.body as any).hits.hits) {
      if (hit.highlight) highlightMap.set(hit._id, hit.highlight);
    }
    return highlightMap;
  } catch (error: any) {
    console.warn('Highlight fetch failed:', error?.message);
    return new Map();
  }
}

export interface SearchOptions {
  page?: number;
  size?: number;
  author?: string | null;
  chapter?: string | null;
  titles?: string | string[] | null;
  mode?: 'text' | 'semantic' | 'hybrid';
}

export async function searchDocuments(
  query: string,
  { page = 1, size = 10, author = null, chapter = null, titles = null, mode = 'hybrid' }: SearchOptions = {}
): Promise<any> {
  try {
    const client = getOpenSearchClient();
    const from = (page - 1) * size;

    const filters: any[] = [];
    if (author) filters.push({ term: { author } });
    if (chapter) filters.push({ term: { chapter: parseInt(chapter, 10) } });
    if (titles) {
      const titleArray = Array.isArray(titles) ? titles : [titles];
      if (titleArray.length > 0) filters.push({ terms: { title: titleArray } });
    }

    let searchResult: any;

    if (mode === 'text') {
      const searchQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { 'text.arabic': { query, boost: 1.2 } } },
          ],
          minimum_should_match: 1,
          filter: filters,
        },
      };

      const response = await client.search({
        index: OPENSEARCH_INDEX,
        body: {
          size: 0,
          query: searchQuery,
          aggs: {
            titles: {
              terms: { field: 'title', size: 100, order: { _key: 'asc' } },
              aggs: {
                volumes: {
                  terms: { field: 'volume', size: 100, order: { _key: 'asc' }, missing: -1 },
                  aggs: {
                    chapters: {
                      terms: { field: 'chapter', size: 1000, order: { _key: 'asc' } },
                      aggs: {
                        verses: {
                          terms: { field: 'verse', size: 1000, order: { _key: 'asc' } },
                          aggs: {
                            top_hit: { top_hits: { size: 1, sort: [{ _score: { order: 'desc' } }] } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      const titleBuckets = (response.body as any).aggregations.titles.buckets || [];
      let allResults: any[] = [];
      titleBuckets.forEach((titleBucket: any) => {
        (titleBucket.volumes.buckets || []).forEach((volumeBucket: any) => {
          (volumeBucket.chapters.buckets || []).forEach((chapterBucket: any) => {
            (chapterBucket.verses.buckets || []).forEach((verseBucket: any) => {
              const topHit = verseBucket.top_hit.hits.hits[0];
              allResults.push({ id: topHit._id, score: topHit._score || 0, ...topHit._source });
            });
          });
        });
      });

      allResults.sort((a, b) => b.score - a.score);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else if (mode === 'semantic') {
      const embedding = await embedQuery(query);
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const finalQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const response = await client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: finalQuery } });
      const allResults = deduplicateResults((response.body as any).hits.hits);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else if (mode === 'hybrid') {
      const embedding = await embedQuery(query);
      const textQuery = {
        bool: {
          should: [
            { match: { text: { query, boost: 1.0 } } },
            { match: { 'text.arabic': { query, boost: 1.2 } } },
          ],
          minimum_should_match: 1,
          filter: filters,
        },
      };
      const knnClause = { knn: { text_embedding: { vector: embedding, k: 100 } } };
      const knnQuery = filters.length > 0 ? { bool: { must: knnClause, filter: filters } } : knnClause;

      const [textResponse, knnResponse] = await Promise.all([
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: textQuery } }),
        client.search({ index: OPENSEARCH_INDEX, body: { size: 100, query: knnQuery } }),
      ]);

      const mergedHits = reciprocalRankFusion(
        (textResponse.body as any).hits.hits,
        (knnResponse.body as any).hits.hits
      );
      const allResults = deduplicateResults(mergedHits);
      const totalResults = allResults.length;
      searchResult = {
        results: allResults.slice(from, from + size),
        total: totalResults,
        page,
        size,
        totalPages: Math.ceil(totalResults / size),
        hasMore: from + size < totalResults,
      };
    } else {
      return { results: [], total: 0, page, size, totalPages: 0, hasMore: false };
    }

    const highlightMap = await fetchHighlights(query, searchResult.results);
    searchResult.results = searchResult.results.map((result: any) => {
      const hl = highlightMap.get(result.id);
      if (hl) result.highlight = hl;
      return result;
    });

    return searchResult;
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new Error('Failed to search documents');
  }
}
