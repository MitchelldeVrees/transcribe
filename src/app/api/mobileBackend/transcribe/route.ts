// src/app/api/mobileBackend/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/requireAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Optional: quick mock for dev (?mock=1)
const MOCK_TEXT = `Spreker A en Spreker B bespraken de release planning voor Q4...`;

const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req.headers);

    const search = req.nextUrl.searchParams;
    const MOCK = search.get('mock') === '1' || process.env.MOCK_TRANSCRIBE === 'true';

    if (!AZURE_FUNCTION_URL) return jsonError('AZURE_FUNCTION_URL missing', 500);

    const form = await req.formData();
    const file = form.get('audioFile');
    const extraInfo =
    (form.get('extraInfo') as string) ??
    (form.get('prompt') as string) ??
    '';
  
    if (MOCK) {
      return NextResponse.json({ text: MOCK_TEXT }, { status: 200 });
    }
    if (!(file instanceof File)) {
      return jsonError('Geen audioFile gevonden in de upload.', 400);
    }

    // Read bytes and preserve metadata
    const ab = await file.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!buf.length) return jsonError('Leeg bestand.', 400);

    const filename = (file as any).name || 'upload.m4a';
    // Some backends prefer audio/mp4 for .m4a
    const contentType =
      (file as any).type ||
      (filename.toLowerCase().endsWith('.m4a') ? 'audio/mp4' : 'application/octet-stream');

    // Rebuild multipart for Azure (keeps filename + content-type)
    const azureForm = new FormData();
    const blob = new Blob([buf], { type: contentType });
    const f = new File([blob], filename, { type: contentType });
    azureForm.append('audioFile', f);
    // Azure function expects 'prompt' (you used this in your web route)
    azureForm.append('prompt', extraInfo);

    const azRes = await fetch(AZURE_FUNCTION_URL, {
      method: 'POST',
      body: azureForm,
      // do not set Content-Type manually; boundary is auto
      cache: 'no-store',
    });

    if (!azRes.ok) {
      const text = await azRes.text().catch(() => '');
      console.error(`Azure (mobileBackend/transcribe) ${azRes.status}:`, text);
      return jsonError('TRANSCRIBE_ERROR', 502);
    }

    const ct = azRes.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const txt = await azRes.text().catch(() => '');
      console.error('Expected JSON from Azure, got:', ct, txt);
      return jsonError('TRANSCRIBE_ERROR', 502);
    }

    const payload: any = await azRes.json();
    const transcript = typeof payload.transcript === 'string' ? payload.transcript.trim() : '';
    if (!transcript) return jsonError('TRANSCRIBE_ERROR', 502);

    return NextResponse.json({ text: transcript }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message || String(e);
    const isAuth = msg.includes('Unauthorized');
    console.error('Error in /api/mobileBackend/transcribe:', e);
    return jsonError(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
