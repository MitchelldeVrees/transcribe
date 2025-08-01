// app/api/transcripts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getTursoClient } from "@/lib/turso";
import { isValidUUID, sanitizeTitle } from "@/lib/validation";

// Helper to authenticate and get internal DB user ID
async function authenticate(): Promise<string | null> {
  const { userId } =  await auth();
  if (!userId) return null;

  const db = getTursoClient();
  const userRes = await db.execute(
    "SELECT id FROM users WHERE subId = ?",
    [userId]
  );
  if (userRes.rows.length === 0) return null;

  return String(userRes.rows[0].id);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await authenticate();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: transcriptId } = await context.params;
  if (!isValidUUID(transcriptId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
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
    } catch {
      qnaArr = [];
    }
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
  const userId = await authenticate();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: transcriptId } = await context.params;
  if (!isValidUUID(transcriptId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }
  const body = await request.json();
  const { title } = body;

  const sanitized = sanitizeTitle(title);
  if (!sanitized) {
    return NextResponse.json(
      { error: "Invalid title" },
      { status: 400 }
    );
  }

  const db = getTursoClient();
  await db.execute(
    "UPDATE transcripts SET title = ? WHERE id = ? AND userId = ?",
    [sanitized, transcriptId, userId]
  );

  return NextResponse.json({ success: true, title: sanitized });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await authenticate();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: transcriptId } = await context.params;
  if (!isValidUUID(transcriptId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const db = getTursoClient();
  await db.execute(
    "DELETE FROM transcripts WHERE id = ? AND userId = ?",
    [transcriptId, userId]
  );

  return NextResponse.json({ success: true });
}
