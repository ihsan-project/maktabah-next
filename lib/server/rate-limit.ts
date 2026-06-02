import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebase-admin';

export class RateLimitError extends Error {
  statusCode: 429 = 429;
  retryAfterSec: number;
  constructor(message: string, retryAfterSec: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

export interface RateLimitOpts {
  bucket: string;        // e.g. 'search' — namespaces counters across routes
  limit: number;         // requests allowed per window
  windowMs: number;      // window length in ms (60_000 = 1 minute)
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();   // leftmost = original client per RFC 7239
  return req.headers.get('x-real-ip') || 'unknown';
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 32);
}

/**
 * Per-IP sliding-window rate limit, backed by Firestore.
 * Fail-open on Firestore errors: logs a warning, allows the request through.
 * Throws RateLimitError(429) only when the request would actually exceed the limit.
 */
export async function requireRateLimit(req: NextRequest, opts: RateLimitOpts): Promise<void> {
  const now = Date.now();
  const minuteKey = Math.floor(now / opts.windowMs);
  const retryAfterSec = Math.max(1, Math.ceil(((minuteKey + 1) * opts.windowMs - now) / 1000));
  const ipHash = hashIp(clientIp(req));
  const bucketDocId = `${opts.bucket}_${minuteKey}`;

  try {
    const db = getAdminDb();
    const bucketRef = db.collection('rateLimits').doc(bucketDocId);
    const ipRef = bucketRef.collection('ips').doc(ipHash);

    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ipRef);
      const current = snap.exists ? (snap.data()?.count ?? 0) : 0;
      if (current >= opts.limit) {
        return false;
      }
      // Mark the parent bucket with an expiresAt for the Firestore TTL policy to clean up.
      tx.set(bucketRef, {
        expiresAt: Timestamp.fromMillis(now + 5 * opts.windowMs),
      }, { merge: true });
      tx.set(ipRef, { count: FieldValue.increment(1) }, { merge: true });
      return true;
    });

    if (!allowed) {
      throw new RateLimitError('Too many requests', retryAfterSec);
    }
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    // Fail open on any Firestore-side failure. Log so monitoring can catch a pattern.
    console.warn(JSON.stringify({
      kind: 'rate-limit',
      bucket: opts.bucket,
      result: 'fail-open',
      reason: err instanceof Error ? err.message : 'unknown',
    }));
  }
}
