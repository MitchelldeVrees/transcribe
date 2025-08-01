// src/app/api/mobileBackend/points/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getTursoClient }       from '@/lib/turso'
import { requireAuth }          from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    // 1️⃣ Authenticate & pull your sub (string)
    const me    = await requireAuth(req.headers)
    const subId = me.sub as string
    if (!subId) throw new Error('No subject in token')

    // 2️⃣ Fetch that user’s points
    const db     = getTursoClient()
    const result = await db.execute(
      'SELECT * FROM rewards WHERE subId = ?',
      [subId]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ data: [] })
    }

    // 3️⃣ Return the rows
    return NextResponse.json({ data: result.rows })

  } catch (err: any) {
    console.error('Error in /api/mobileBackend/points:', err)
    const status = err.message.includes('token') ? 401 : 500
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized' : 'Internal Server Error' },
      { status }
    )
  }
}
