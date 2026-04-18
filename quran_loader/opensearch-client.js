const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');

let client;

function getOpenSearchClient() {
  if (client) return client;

  if (!process.env.OPENSEARCH_URL) {
    throw new Error('OPENSEARCH_URL is not set');
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set for SigV4 auth');
  }

  client = new Client({
    ...AwsSigv4Signer({
      region: process.env.AWS_REGION || 'us-east-1',
      service: 'es',
      getCredentials: () => Promise.resolve({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }),
    }),
    node: process.env.OPENSEARCH_URL,
  });

  return client;
}

module.exports = { getOpenSearchClient };
