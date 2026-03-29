const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

const BUCKET_NAME = 'maktabah-8ac04.firebasestorage.app';
const TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache persists across warm Cloud Function invocations
const cache = new Map();

/**
 * Fetch a JSON file from Firebase Storage with in-memory caching.
 * @param {string} path File path within the storage bucket
 * @returns {Promise<any>} Parsed JSON contents
 */
async function getCachedJson(path) {
  const entry = cache.get(path);
  if (entry && Date.now() - entry.timestamp < TTL_MS) {
    return entry.data;
  }

  const bucket = admin.storage().bucket(BUCKET_NAME);
  const file = bucket.file(path);

  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found in storage: ${path}`);
  }

  const [content] = await file.download();
  const data = JSON.parse(content.toString('utf-8'));

  cache.set(path, { data, timestamp: Date.now() });
  return data;
}

/**
 * Clear the in-memory cache (useful for testing).
 */
function clearCache() {
  cache.clear();
}

module.exports = { getCachedJson, clearCache };
