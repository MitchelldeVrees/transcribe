// src/app/api/mobileBackend/user/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTursoClient } from '@/lib/turso';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  console.log("/api/mobileBackend/user called");
  try {
    // 1️⃣ Authenticate
    const me = await requireAuth(req.headers);
    console.log(me);
    const subId = me.sub as string;

    // 2️⃣ Fetch user record
    const db = getTursoClient();
    const userRes = await db.execute(
      `SELECT id, name, email, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [subId]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const row = userRes.rows[0] as any;
    let avatarUrl: string | null = null;
    if (row.avatar) {
      const avatarRes = await db.execute('SELECT image FROM images WHERE id = ?', [row.avatar]);
      avatarUrl = typeof avatarRes.rows[0]?.image === 'string' ? avatarRes.rows[0].image : null;
    }

    return NextResponse.json({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: avatarUrl,
      referralCode: row.referralCode,
    });
  } catch (err: any) {
    console.error('/api/mobileBackend/user error:', err);
    const status = err.message.includes('token') ? 401 : 500;
    return NextResponse.json({ error: status === 401 ? 'Unauthorized' : 'Internal Server Error' }, { status });
  }
}
