import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, hashApiKey, generateRawApiKey, AuthError } from '@/lib/server/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const uid = await requireUser(req);
    const db = getAdminDb();
    const snapshot = await db
      .collection('users')
      .doc(uid)
      .collection('apiKeys')
      .orderBy('createdAt', 'desc')
      .get();

    const keys = snapshot.docs.map((doc) => ({
      keyId: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || null,
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('listApiKeys error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const name = (body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'API key name is required' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json(
        { error: 'API key name must be 100 characters or less' },
        { status: 400 }
      );
    }

    const db = getAdminDb();

    const existingKeys = await db
      .collection('users')
      .doc(uid)
      .collection('apiKeys')
      .where('status', '==', 'active')
      .get();
    if (existingKeys.size >= 5) {
      return NextResponse.json(
        { error: 'Maximum of 5 active API keys allowed' },
        { status: 429 }
      );
    }

    const rawKey = generateRawApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPrefix = rawKey.slice(0, 7) + '...' + rawKey.slice(-4);
    const now = FieldValue.serverTimestamp();

    const batch = db.batch();
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
    batch.set(db.collection('users').doc(uid).collection('apiKeys').doc(keyHash), {
      keyPrefix,
      name,
      createdAt: now,
      status: 'active',
    });
    await batch.commit();

    return NextResponse.json({ key: rawKey, keyId: keyHash, name, keyPrefix });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('generateApiKey error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
