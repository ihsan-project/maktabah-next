import { Client } from '@elastic/elasticsearch';

// Initialize ElasticSearch client
const client = new Client({
  node: process.env.ELASTICSEARCH_URL,
  auth: {
    username: process.env.ELASTICSEARCH_USERNAME,
    password: process.env.ELASTICSEARCH_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // Set to true in production
  }
});

// Search function to query ElasticSearch
export async function searchDocuments(query, page = 1, size = 10) {
  try {
    const startIndex = (page - 1) * size;
    
    const response = await client.search({
      index: process.env.ELASTICSEARCH_INDEX,
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
    const total = response.hits.total.value;
    
    const results = hits.map(hit => ({
      id: hit._id,
      score: hit._score,
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
