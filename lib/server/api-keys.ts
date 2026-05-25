import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/server/firebase-admin';

export class AuthError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AuthError';
  }
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function generateRawApiKey(): string {
  const bytes = crypto.randomBytes(32);
  return `mk_${bytes.toString('base64url')}`;
}

/**
 * Verify the Firebase ID token on the request and return the caller's uid.
 * @throws AuthError(401) when the header is missing or the token is invalid.
 */
export async function requireUser(req: NextRequest): Promise<string> {
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthError(401, 'Must be logged in');
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new AuthError(401, 'Must be logged in');
  }
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    return decoded.uid;
  } catch {
    throw new AuthError(401, 'Invalid authentication token');
  }
}

/**
 * Map an error thrown inside an API-key route to a JSON response.
 * AuthError → its statusCode; anything else → logged 500 (no internals leaked).
 */
export function handleRouteError(error: unknown, label: string): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  console.error(`${label} error:`, error);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}
