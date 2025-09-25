// src/app/api/mobileBackend/transcripts/[id]/route.ts
import { NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth } from '@/lib/requireAuth';

export const runtime = 'nodejs';

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function getIdFromContext(context: unknown): string | null {
  try {
    const id = (context as any)?.params?.id;
    return typeof id === 'string' && id.length ? id : null;
  } catch {
    return null;
  }
}

/**
 * PATCH /api/mobileBackend/transcripts/:id
 * Body: { title: string }
 */
export async function PATCH(req: Request, context: any) {
  try {
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);

    const id = getIdFromContext(context);
    if (!id) return jsonError('Missing transcript id', 400);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError('Invalid JSON body', 400);
    }

    const rawTitle = (body as any)?.title ?? '';
    const title = String(rawTitle).trim();
    if (!title) return jsonError('Title is required', 400);
    if (title.length > 120) return jsonError('Title too long (max 120 chars)', 422);

    const db = getTursoClient();

    await db.execute(
      `UPDATE transcripts SET title = ?
       WHERE id = ? AND subId = ?`,
      [title, id, subId]
    );

    const rowRes = await db.execute(
      `SELECT id, title FROM transcripts WHERE id = ? AND subId = ?`,
      [id, subId]
    );
    const row = rowRes.rows?.[0] as any;
    if (!row) return jsonError('Not found', 404);

    return NextResponse.json({ id: row.id, title: row.title }, { status: 200 });
  } catch (err: any) {
    const isAuth = /unauthor/i.test(String(err?.name)) || /unauthor/i.test(String(err?.message));
    console.error('Error in PATCH /api/mobileBackend/transcripts/:id', err);
    return jsonError(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}

/**
 * DELETE /api/mobileBackend/transcripts/:id
 */
export async function DELETE(req: Request, context: any) {
  try {
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);

    const id = getIdFromContext(context);
    if (!id) return jsonError('Missing transcript id', 400);

    const db = getTursoClient();

    await db.execute(
      `DELETE FROM transcripts WHERE id = ? AND subId = ?`,
      [id, subId]
    );

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    const isAuth = /unauthor/i.test(String(err?.name)) || /unauthor/i.test(String(err?.message));
    console.error('Error in DELETE /api/mobileBackend/transcripts/:id', err);
    return jsonError(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
