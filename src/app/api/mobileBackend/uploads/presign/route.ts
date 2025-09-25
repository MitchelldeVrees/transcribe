// app/api/mobileBackend/uploads/presign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/requireAuth';
import {
  BlobSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AZURE_STORAGE_ACCOUNT = process.env.AZURE_STORAGE_ACCOUNT!;
const AZURE_STORAGE_KEY     = process.env.AZURE_STORAGE_KEY!;
const AZURE_BLOB_CONTAINER  = process.env.AZURE_BLOB_CONTAINER!;

const cred = new StorageSharedKeyCredential(AZURE_STORAGE_ACCOUNT, AZURE_STORAGE_KEY);

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req.headers);

  const { filename, mimeType } = await req.json().catch(() => ({}));
  if (!filename || !mimeType) return bad('filename & mimeType required');

  // (Optional) allowlist & size gating happens BEFORE presign (you can pass expected size from client)
  const safeName = String(filename).replace(/[^\w.\-]+/g, '_');
  const blobName = `uploads/${me.sub}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${safeName}`;

  const startsOn  = new Date(Date.now() - 60_000);        // 1 min skew
  const expiresOn = new Date(Date.now() + 15 * 60_000);   // 15 min TTL

  const sas = generateBlobSASQueryParameters({
    containerName: AZURE_BLOB_CONTAINER,
    blobName,
    permissions: BlobSASPermissions.parse('cw'), // Create + Write
    startsOn,
    expiresOn,
    protocol: SASProtocol.Https,
    // Optional response headers guards:
    contentType: mimeType,
  }, cred).toString();

  const base = `https://${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/${AZURE_BLOB_CONTAINER}/${blobName}`;
  const uploadUrl = `${base}?${sas}`;

  return NextResponse.json({
    uploadUrl,   // PUT here with x-ms-blob-type: BlockBlob
    blobName,    // your stable "id" to reference later
  });
}
