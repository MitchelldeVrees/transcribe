// src/app/api/transcripts/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTursoClient } from '@/lib/turso';
import { sanitizeTitle } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const user = await (await clerkClient()).users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress || '';
  const name = user.firstName + ' ' + (user.lastName || '');
  const subId = userId;

  const db = getTursoClient();

  // Ensure user exists in DB
  const userRes = await db.execute(
    'SELECT id FROM users WHERE subId = ?',
    [subId]
  );

  let userIdDb: string;
  if (userRes.rows.length > 0) {
    userIdDb = String(userRes.rows[0].id);
  } else {
    const today = new Date().toISOString().split('T')[0];
    await db.execute(
      'INSERT INTO users (email, name, created, subId) VALUES (?, ?, ?, ?)',
      [email, name, today, subId]
    );
    const newUserRes = await db.execute(
      'SELECT id FROM users WHERE subId = ?',
      [subId]
    );
    userIdDb = String(newUserRes.rows[0].id);
  }

  // Fetch transcripts
  const txRes = await db.execute(
    'SELECT * FROM transcripts WHERE userId = ?',
    [userIdDb]
  );

  return NextResponse.json({
    user: { id: subId, email, name },
    transcripts: txRes.rows
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const user = await (await clerkClient()).users.getUser(userId);
  const email = user.emailAddresses[0]?.emailAddress || '';
  const name = user.firstName + ' ' + (user.lastName || '');

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { title, content, summary, actionItems, qna,processingTime,audioDuration } = body;

  const cleanTitle = sanitizeTitle(title);
  if (!cleanTitle || typeof content !== 'string' || content.trim() === '') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  let qnaPayload: any = null;
  if (Array.isArray(qna)) {
    const sanitizedQna = qna.filter(item =>
      item && typeof item.question === 'string' && typeof item.answer === 'string'
    ).map(item => ({ question: item.question.trim(), answer: item.answer.trim() }));
    qnaPayload = sanitizedQna.length > 0 ? JSON.stringify(sanitizedQna) : null;
  }
  const db = getTursoClient();

  // Ensure user exists
  const userRes = await db.execute(
    'SELECT id FROM users WHERE subId = ?',
    [userId]
  );

  let userIdDb: string;
  if (userRes.rows.length > 0) {
    userIdDb = String(userRes.rows[0].id);
  } else {
    userIdDb = crypto.randomUUID();
    const created = new Date().toISOString();
    await db.execute(
      'INSERT INTO users (id, email, name, created, subId) VALUES (?, ?, ?, ?, ?)',
      [userIdDb, email, name, created, userId]
    );
  }

  // Save transcript
  const transcriptId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO transcripts
      (id, title, transcript, summary, actionPoints, qna, created, userId, length, audioLength)
     VALUES (?,?, ?, ?, ?, ?, ?, ?,?,?)`,
    [
      transcriptId,
      cleanTitle,
      content,
      typeof summary === 'string' ? summary : null,
      typeof actionItems === 'string' ? actionItems : null,
      qnaPayload,
      createdAt,
      userIdDb,
      processingTime,
      audioDuration
    ]
  );

  return NextResponse.json({ success: true, id: transcriptId });
}
