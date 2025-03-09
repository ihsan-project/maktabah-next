import { Client } from '@elastic/elasticsearch';
import { SearchResponse } from '@/types';

// Initialize ElasticSearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL as string,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME as string,
    password: process.env.ELASTICSEARCH_PASSWORD as string
  },
  tls: {
    rejectUnauthorized: false // Set to true in production
  }
});

// Search function to query ElasticSearch
export async function searchDocuments(
  query: string, 
  page: number = 1, 
  size: number = 10
): Promise<SearchResponse> {
  try {
    const startIndex = (page - 1) * size;
    
    const response = await client.search({
      index: process.env.ELASTICSEARCH_INDEX as string,
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