// src/app/api/mobileBackend/transcripts/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient }       from '@/lib/turso';
import { requireAuth }          from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    // ── AUTHENTICATE ───────────────────────────────────────
    const me     = await requireAuth(req.headers);
    const subId  = me.sub as string;
    if (!subId) throw new Error('No subject in token');

    // ── FETCH USER’S TRANSCRIPTS ───────────────────────────
    const db    = getTursoClient();
    const txRes = await db.execute(
      `SELECT id, title, summary, transcript AS fullText, created
         FROM transcripts
        WHERE subId = ?`,
      [subId]
    );

    // ── RETURN ─────────────────────────────────────────────
    return NextResponse.json({
      transcripts: txRes.rows.map(r => ({
        id:       r.id,
        title:    r.title,
        summary:  r.summary,
        fullText: r.fullText,
        created:  r.created,
      })),
    });
  } catch (err: any) {
    console.error('Error in /api/mobileBackend/transcripts:', err);
    const status = err.message.includes('token') ? 401 : 500;
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    );
  }
}
