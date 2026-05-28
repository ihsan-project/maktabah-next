import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/server/firebase-admin';
import { requireUser, handleRouteError } from '@/lib/server/api-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { keyId: string } }
) {
  try {
    const uid = await requireUser(req);
    const keyId = params.keyId;
    if (!keyId) {
      return NextResponse.json({ error: 'keyId is required' }, { status: 400 });
    }

    const db = getAdminDb();
    const keyDoc = await db.collection('apiKeys').doc(keyId).get();
    if (!keyDoc.exists || keyDoc.data()?.uid !== uid) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }
    if (keyDoc.data()?.status === 'revoked') {
      return NextResponse.json({ error: 'API key is already revoked' }, { status: 409 });
    }

    const batch = db.batch();
    batch.update(db.collection('apiKeys').doc(keyId), { status: 'revoked' });
    batch.update(db.collection('users').doc(uid).collection('apiKeys').doc(keyId), {
      status: 'revoked',
    });
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleRouteError(error, 'revokeApiKey');
  }
}
