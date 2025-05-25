// app/api/transcripts/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { getTursoClient } from "@/lib/turso";

export const runtime = "edge";
const { NEXTAUTH_SECRET } = process.env;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // 1) Authenticate
  const token = await getToken({ req: request, secret: NEXTAUTH_SECRET! });
  if (!token?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const email = token.email as string;

  // 2) Await the params object and pull out `id`
  const { id: transcriptId } = await context.params;

  // 3) Look up your user in Turso
  const db = getTursoClient();
  const userRes = await db.execute(
    "SELECT id FROM users WHERE email = ?",
    [email]
  );
  if (userRes.rows.length === 0) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  const userId = String(userRes.rows[0].id);

  // 4) Fetch only that user’s transcript
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

  // 5) Parse the Q&A JSON column
  const row = txRes.rows[0] as Record<string, any>;
  let qnaArr: { question: string; answer: string }[] = [];
  if (row.qna) {
    try {
      qnaArr = JSON.parse(row.qna);
    } catch {
      /* ignore invalid JSON */
    }
  }

  // 6) Return exactly what the frontend page component expects
  return NextResponse.json({
    transcript: {
      id: String(row.id),
      title: row.title,
      content: row.content,
      summary: row.summary,
      actionPoints: row.actionPoints,
      qna: qnaArr,
      created: row.created,
      timeLength: row.timeLength , 
      audioLength: row.audioLength 
    },
  });
}
