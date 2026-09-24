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
  const contentLengthHeader = req.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;

  if (!req.body || !Number.isFinite(contentLength) || contentLength <= 0) {
    return error('Content-Length header is vereist.', 411);
  }

  const headers = new Headers({
    'x-ms-blob-type': 'BlockBlob',
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
  });

  // Azure's "Put Blob" rejects chunked transfer-encoding and requires a real
  // Content-Length. Cloudflare Workers' fetch sends a streamed body as
  // chunked and drops any Content-Length header you set yourself, so we pipe
  // through FixedLengthStream to force a fixed-length (non-chunked) request.
  const FixedLengthStreamCtor = (globalThis as any).FixedLengthStream;
  let outboundBody: ReadableStream | ReadableStream<Uint8Array> = req.body;
  if (FixedLengthStreamCtor) {
    const { readable, writable } = new FixedLengthStreamCtor(contentLength);
    req.body.pipeTo(writable);
    outboundBody = readable;
  }

  const azureRes = await fetch(uploadUrl.toString(), {
    method: 'PUT',
    headers,
    body: outboundBody,
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
