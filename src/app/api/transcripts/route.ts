// src/app/api/transcripts/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getTursoClient } from '@/lib/turso';

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

  const { title, content, summary, actionItems, qna } = await req.json();
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
      (title, transcript, summary, actionPoints, qna, created, userId)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      title,
      content,
      summary || null,
      actionItems || null,
      qna ? JSON.stringify(qna) : null,
      createdAt,
      userIdDb
    ]
  );

  return NextResponse.json({ success: true, id: transcriptId });
}
