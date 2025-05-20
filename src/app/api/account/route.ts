// src/app/api/transcripts/route.ts
import { NextResponse } from 'next/server'
import { getTursoClient } from '@/lib/turso'

export const runtime = 'edge'

export async function GET() {
  const db = getTursoClient()
  console.log("In the database")
  try {
    // pull all transcripts, most recent first
    const result = await db.execute(
      'SELECT * FROM transcripts'
    )
    console.log(result)
    // result.rows is an array of objects: { id, content, created_at }
    return NextResponse.json({ transcripts: result.rows })
  } catch (e) {
    console.error('Turso error', e)
    return NextResponse.json(
      { error: 'Database error while fetching transcripts' },
      { status: 500 }
    )
  }
}
