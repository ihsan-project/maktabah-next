import { Client } from '@opensearch-project/opensearch';
import { SearchResponse } from '@/types';

// Initialize OpenSearch client
const client = new Client({
  node: process.env.OPENSEARCH_URL as string,
  auth: {
    username: process.env.OPENSEARCH_USERNAME as string,
    password: process.env.OPENSEARCH_PASSWORD as string
  },
  ssl: {
    rejectUnauthorized: process.env.NODE_ENV === 'production'
  }
});

// Search function to query OpenSearch
export async function searchDocuments(
  query: string,
  page: number = 1,
  size: number = 10
): Promise<SearchResponse> {
  try {
    const startIndex = (page - 1) * size;

    const response = await client.search({
      index: process.env.OPENSEARCH_INDEX as string,
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

    const hits = response.body.hits.hits;
    const total = typeof response.body.hits.total === 'number'
      ? response.body.hits.total
      : response.body.hits.total?.value || 0;

    const results = hits.map((hit: any) => ({
      id: hit._id,
      score: hit._score || 0,
      ...hit._source as any,
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
