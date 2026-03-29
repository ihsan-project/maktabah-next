const crypto = require('crypto');
const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * Hash an API key using SHA-256 for secure storage/lookup.
 * @param {string} key Raw API key
 * @returns {string} Hex-encoded SHA-256 hash
 */
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Generate a new API key with the mk_ prefix.
 * @returns {string} Raw API key (shown to user once, then never again)
 */
function generateRawApiKey() {
  const bytes = crypto.randomBytes(32);
  return `mk_${bytes.toString('base64url')}`;
}

/**
 * Validate an API key from a request and enforce rate limiting.
 *
 * Extracts the key from the Authorization header (Bearer <key>),
 * looks it up in Firestore, checks status, and enforces per-minute rate limits.
 *
 * @param {object} req Express-style request object
 * @returns {Promise<{uid: string, keyHash: string}>} The owning user's UID and key hash
 * @throws {ApiKeyError} With statusCode and message on failure
 */
async function validateApiKey(req) {
  const authHeader = req.headers?.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new ApiKeyError(401, 'Missing or invalid Authorization header. Use: Bearer <api-key>');
  }

  const rawKey = authHeader.slice(7).trim();
  if (!rawKey) {
    throw new ApiKeyError(401, 'API key is empty');
  }

  const keyHash = hashApiKey(rawKey);
  const db = admin.firestore();
  const keyDoc = await db.collection('apiKeys').doc(keyHash).get();

  if (!keyDoc.exists) {
    throw new ApiKeyError(401, 'Invalid API key');
  }

  const keyData = keyDoc.data();

  if (keyData.status !== 'active') {
    throw new ApiKeyError(401, 'API key has been revoked');
  }

  // Rate limiting: sliding window per minute
  const rateLimit = keyData.rateLimit || 30;
  const now = Date.now();
  const windowKey = `${Math.floor(now / 60000)}`; // minute-level window
  const rateLimitRef = db.collection('apiKeys').doc(keyHash).collection('rateLimit').doc(windowKey);

  const rateLimitResult = await db.runTransaction(async (tx) => {
    const rateLimitDoc = await tx.get(rateLimitRef);
    const currentCount = rateLimitDoc.exists ? rateLimitDoc.data().count : 0;

    if (currentCount >= rateLimit) {
      return { allowed: false, remaining: 0, resetAt: (Math.floor(now / 60000) + 1) * 60000 };
    }

    tx.set(rateLimitRef, {
      count: currentCount + 1,
      windowStart: Math.floor(now / 60000) * 60000,
    }, { merge: true });

    return { allowed: true, remaining: rateLimit - currentCount - 1, resetAt: (Math.floor(now / 60000) + 1) * 60000 };
  });

  if (!rateLimitResult.allowed) {
    const err = new ApiKeyError(429, 'Rate limit exceeded');
    err.headers = {
      'X-RateLimit-Limit': String(rateLimit),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': String(rateLimitResult.resetAt),
    };
    throw err;
  }

  // Update usage stats (fire-and-forget, don't block the request)
  keyDoc.ref.update({
    lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    requestCount: admin.firestore.FieldValue.increment(1),
  }).catch(err => logger.warn('Failed to update API key usage stats:', err.message));

  return {
    uid: keyData.uid,
    keyHash,
    rateLimitRemaining: rateLimitResult.remaining,
    rateLimitReset: rateLimitResult.resetAt,
    rateLimit,
  };
}

class ApiKeyError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.headers = {};
  }
}

module.exports = {
  hashApiKey,
  generateRawApiKey,
  validateApiKey,
  ApiKeyError,
};
