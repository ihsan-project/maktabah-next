const functions = require('firebase-functions');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { hashApiKey, generateRawApiKey } = require('./lib/api-key-auth');
const { handleMcpRequest } = require('./mcp/handler');
const { searchDocuments } = require('./lib/search-core');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
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
          const searchResults = await searchDocuments(query, { page, size, author, chapter, titles, mode });

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

// --- MCP Server ---

exports.mcpServer = functions.https.onRequest(
  {
    timeoutSeconds: 300,
    minInstances: 0,
    secrets: ['OPENSEARCH_URL', 'OPENSEARCH_USERNAME', 'OPENSEARCH_PASSWORD', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
  async (req, res) => {
    await handleMcpRequest(req, res);
  }
);

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
