#!/usr/bin/env node

const path = require('path');
const readline = require('readline');
const { Client } = require('@opensearch-project/opensearch');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const INDEX_NAME = 'kitaab';

const opensearchClient = new Client({
  node: process.env.OPENSEARCH_URL || 'http://localhost:9200',
  auth: (process.env.OPENSEARCH_USERNAME && process.env.OPENSEARCH_PASSWORD)
    ? { username: process.env.OPENSEARCH_USERNAME, password: process.env.OPENSEARCH_PASSWORD }
    : undefined,
  ssl: { rejectUnauthorized: process.env.NODE_ENV === 'production' }
});

async function main() {
  try {
    const { body: exists } = await opensearchClient.indices.exists({ index: INDEX_NAME });
    if (!exists) {
      console.log(`Index "${INDEX_NAME}" does not exist. Nothing to delete.`);
      return;
    }

    const { body: stats } = await opensearchClient.count({ index: INDEX_NAME });
    console.log(`\nIndex "${INDEX_NAME}" contains ${stats.count} documents.`);
    console.log('This action is irreversible.\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
      rl.question(`Type "delete ${INDEX_NAME}" to confirm: `, resolve);
    });
    rl.close();

    if (answer !== `delete ${INDEX_NAME}`) {
      console.log('Aborted.');
      return;
    }

    await opensearchClient.indices.delete({ index: INDEX_NAME });
    console.log(`Index "${INDEX_NAME}" deleted.`);
  } catch (error) {
    console.error('Error:', error.message || error);
  } finally {
    await opensearchClient.close();
  }
}

main().catch(console.error);
