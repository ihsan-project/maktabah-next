import { NextRequest } from 'next/server';
import { getAdminAppCheck } from '@/lib/server/firebase-admin';

export class AppCheckError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppCheckError';
  }
}

/**
 * Verify the Firebase App Check token on the request.
 * When APP_CHECK_ENFORCE is not 'true', logs the verification result and returns
 * (kill switch). When enforcement is on, throws AppCheckError(401) on missing
 * or invalid token. Never fails open.
 */
export async function requireAppCheck(req: NextRequest): Promise<void> {
  const enforced = process.env.APP_CHECK_ENFORCE === 'true';
  const route = req.nextUrl.pathname;
  const token = req.headers.get('X-Firebase-AppCheck');

  if (!token) {
    console.log(JSON.stringify({
      kind: 'app-check',
      route,
      enforced,
      result: 'fail',
      reason: 'missing-header',
    }));
    if (enforced) {
      throw new AppCheckError(401, 'AppCheck required');
    }
    return;
  }

  try {
    await getAdminAppCheck().verifyToken(token);
    console.log(JSON.stringify({
      kind: 'app-check',
      route,
      enforced,
      result: 'pass',
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'verify-threw';
    console.log(JSON.stringify({
      kind: 'app-check',
      route,
      enforced,
      result: 'fail',
      reason,
    }));
    if (enforced) {
      throw new AppCheckError(401, 'AppCheck invalid');
    }
  }
}
