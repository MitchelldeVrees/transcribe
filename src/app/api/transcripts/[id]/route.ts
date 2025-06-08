// app/api/transcripts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getTursoClient } from "@/lib/turso";

export const runtime = "edge";
const { NEXTAUTH_SECRET } = process.env;

// Helper to authenticate and get userId
async function authenticate(request: NextRequest) {
  const token = await getToken({ req: request, secret: NEXTAUTH_SECRET! });
  if (!token?.email) {
    return null;
  }
  const email = token.email as string;
  const db = getTursoClient();
  const userRes = await db.execute(
    "SELECT id FROM users WHERE email = ?",
    [email]
  );
  if (userRes.rows.length === 0) {
    return null;
  }
  return String(userRes.rows[0].id);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await authenticate(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: transcriptId } = await context.params;
  const db = getTursoClient();
  const txRes = await db.execute(
    `SELECT 
       id,
       title,
       transcript as content,
       summary,
       actionPoints,
       qna,
       created,
       length as timeLength,
       audioLength
     FROM transcripts
     WHERE id = ? AND userId = ?`,
    [transcriptId, userId]
  );

  if (txRes.rows.length === 0) {
    return NextResponse.json({ error: "Transcript not found" }, { status: 404 });
  }

  const row = txRes.rows[0] as Record<string, any>;
  let qnaArr: { question: string; answer: string }[] = [];
  if (row.qna) {
    try {
      qnaArr = JSON.parse(row.qna);
    } catch {}
  }

  return NextResponse.json({
    transcript: {
      id: String(row.id),
      title: row.title,
      content: row.content,
      summary: row.summary,
      actionPoints: row.actionPoints,
      qna: qnaArr,
      created: row.created,
      timeLength: row.timeLength,
      audioLength: row.audioLength,
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await authenticate(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: transcriptId } = await context.params;
  const body = await request.json();
  const { title } = body;
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json(
      { error: "Invalid title" },
      { status: 400 }
    );
  }

  const db = getTursoClient();
  const updateRes = await db.execute(
    "UPDATE transcripts SET title = ? WHERE id = ? AND userId = ?",
    [title.trim(), transcriptId, userId]
  );
  // You may check updateRes.rowsAffected if available

  return NextResponse.json({ success: true, title: title.trim() });
}
