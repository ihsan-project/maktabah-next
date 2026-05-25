import { NextRequest, NextResponse } from 'next/server';
import { getAdminStorage, STORAGE_BUCKET } from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = (params.path || []).join('/');
  if (!filePath) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  try {
    const bucket = getAdminStorage().bucket(STORAGE_BUCKET);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      return new NextResponse('File not found', { status: 404 });
    }

    const [fileContent] = await file.download();
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error proxying file from Storage:', error);
    return new NextResponse('Error fetching file', { status: 500 });
  }
}
