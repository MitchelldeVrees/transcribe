import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT;
const AZURE_BLOB_CONTAINER = process.env.AZURE_BLOB_CONTAINER;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PUT(req: NextRequest) {
  await requireAuth(req.headers);

  if (!AZURE_STORAGE_ACCOUNT || !AZURE_BLOB_CONTAINER) {
    return error('Azure storage is niet geconfigureerd.', 500);
  }

  const target = req.nextUrl.searchParams.get('target');
  if (!target) {
    return error('Ontbrekende target parameter.');
  }

  let uploadUrl: URL;
  try {
    uploadUrl = new URL(target);
  } catch {
    return error('Ongeldige upload URL.');
  }

  const expectedHost = `${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net`;
  if (uploadUrl.hostname !== expectedHost) {
    return error('Upload host is niet toegestaan.', 400);
  }

  if (!uploadUrl.pathname.startsWith(`/${AZURE_BLOB_CONTAINER}/`)) {
    return error('Upload container is ongeldig.', 400);
  }

  const contentType = req.headers.get('content-type') || 'application/octet-stream';
  const contentLength = req.headers.get('content-length');

  const headers = new Headers({
    'x-ms-blob-type': 'BlockBlob',
    'Content-Type': contentType,
  });
  if (contentLength) {
    headers.set('Content-Length', contentLength);
  }

  const azureRes = await fetch(uploadUrl.toString(), {
    method: 'PUT',
    headers,
    body: req.body,
    // Required so Node's fetch does not buffer the whole stream.
    // @ts-expect-error - duplex is still experimental in types.
    duplex: 'half',
  });

  if (!azureRes.ok) {
    const text = await azureRes.text().catch(() => '');
    return error(text || 'Azure upload is mislukt.', 502);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
