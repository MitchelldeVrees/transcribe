// src/app/api/transcripts/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { getTursoClient } from '@/lib/turso';

export const runtime = 'edge';
const { TURSO_AUTH_TOKEN, NEXTAUTH_SECRET } = process.env;

export async function GET(req: NextRequest) {
    console.log("Inside transcipts requesst")
  // 1. Authenticate
  const token = await getToken({ req, secret: NEXTAUTH_SECRET });
  console.log(token);
  if (!token?.email) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 }
    );
  }
  const email = token.email as string;
  const name = token.name as string ;
  const subId = token.sub as string;
  console.log("Token: ", email);
  const db = getTursoClient();

  // 2. Ensure the user exists (upsert by email)
  // First try to read the user
  const userRes = await db.execute(
    'SELECT id FROM users WHERE subId = ?',
    [subId]
  );
  let userId: string;
  if (userRes.rows.length > 0) {
    userId = userRes.rows[0].id as string;
  } else {
    // generate a UUID for Turso (Edge runtime has crypto.randomUUID)
    const today = new Date().toISOString().split('T')[0]; // e.g. "2025-05-22"

    await db.execute(
      'INSERT INTO users (email, name,created, subId) VALUES (?, ?,?,?)',
      [email, name, today ?? null, subId]
    );
  }

  const userIdTranscripts = await db.execute(
    `SELECT id
       FROM users WHERE subId = ?`,
    [subId]
    
  );
  console.log(userIdTranscripts.rows[0].id);
  // 3. Fetch *only* that user’s transcripts
  const txRes = await db.execute(
    `SELECT *
       FROM transcripts WHERE userId = ?`,
    [String(userIdTranscripts.rows[0].id)]
    
  );


  return NextResponse.json({
    user: { id: subId, email, name },
    transcripts: txRes.rows
  });
}
export async function POST(req: NextRequest) {
    console.log("SAVING TRANSCRIPT")
    // 1) Authenticate via NextAuth JWT
    const token = await getToken({ req, secret: NEXTAUTH_SECRET });
    if (!token?.email) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }
    const email = token.email as string;
  
    // 2) Parse incoming data
    const { title, content, summary, actionItems, qna } = await req.json();
  
    const db = getTursoClient();
  
    // 3) Look up or create the user
    const userRes = await db.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    let userId: string;
    if (userRes.rows.length > 0) {
      userId = String(userRes.rows[0].id);
    } else {
      userId = crypto.randomUUID();
      const created = new Date().toISOString();
      await db.execute(
        "INSERT INTO users (email, name, created) VALUES (?, ?, ?)",
        [ email, token.name ?? null, created]
      );
    }
  
    const userResId = await db.execute(
        "SELECT id FROM users WHERE email = ?",
        [email]
      );

    const userIdData = String(userResId.rows[0].id);  // coerce to string if needed

    // 4) Insert the transcript
    const transcriptId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    await db.execute(
      `INSERT INTO transcripts
         ( title,transcript, summary, actionPoints, qna, created, userId)
       VALUES (  ?, ?, ?, ?, ?, ?,?)`,
      [
        title,
        content,
        summary || null,
        actionItems || null,
        qna ? JSON.stringify(qna) : null,
        createdAt,
        userIdData,
      ]
    );
  
    return NextResponse.json({ success: true, id: transcriptId });
  }
