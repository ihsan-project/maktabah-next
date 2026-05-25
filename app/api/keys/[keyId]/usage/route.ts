import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, AuthError } from '@/lib/server/api-keys';
import { getUsageData } from '@/lib/server/usage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const uid = await requireUser(req);
    const keyId = params.keyId;
    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const daysParam = parseInt(req.nextUrl.searchParams.get('days') || '7', 10);
    const days = Math.min(Math.max(Number.isNaN(daysParam) ? 7 : daysParam, 1), 10);

    const db = getAdminDb();
    const keyDoc = await db.collection('apiKeys').doc(keyId).get();
    if (!keyDoc.exists || keyDoc.data()?.uid !== uid) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    const keyData = keyDoc.data()!;
    const usage = await getUsageData(keyId, days);

    return NextResponse.json({
      keyId,
      requestCount: keyData.requestCount || 0,
      lastUsedAt: keyData.lastUsedAt?.toDate?.()?.toISOString() || null,
      rateLimit: keyData.rateLimit || 30,
      usage,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('getApiKeyUsage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
