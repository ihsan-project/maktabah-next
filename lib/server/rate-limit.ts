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
 * Each (bucket, minute, IP) is a flat doc at rateLimits/{bucket}_{minuteKey}_{ipHash}
 * with { count, expiresAt }. Flat shape avoids the contention hotspot of a single
 * bucket-parent doc, and lets the TTL policy on `rateLimits` (field `expiresAt`)
 * delete every doc — subcollection cleanup does not cascade in Firestore.
 *
 * Fail-open on Firestore errors: logs a warning, allows the request through.
 * Throws RateLimitError(429) only when the request would actually exceed the limit.
 */
export async function requireRateLimit(req: NextRequest, opts: RateLimitOpts): Promise<void> {
  const now = Date.now();
  const minuteKey = Math.floor(now / opts.windowMs);
  const retryAfterSec = Math.max(1, Math.ceil(((minuteKey + 1) * opts.windowMs - now) / 1000));
  const ipHash = hashIp(clientIp(req));
  const docId = `${opts.bucket}_${minuteKey}_${ipHash}`;

  try {
    const db = getAdminDb();
    const docRef = db.collection('rateLimits').doc(docId);

    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const current = snap.exists ? (snap.data()?.count ?? 0) : 0;
      if (current >= opts.limit) {
        return false;
      }
      tx.set(docRef, {
        count: FieldValue.increment(1),
        expiresAt: Timestamp.fromMillis(now + 5 * opts.windowMs),
      }, { merge: true });
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
