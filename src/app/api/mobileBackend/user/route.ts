// src/app/api/mobileBackend/user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';

export async function POST(req: NextRequest) {
  console.log('/api/mobileBackend/user called');
  try {
    // 1) Authenticate (throws TokenExpiredError/UnauthorizedError on problems)
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);

    // 2) Fetch user record
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

    // Resolve avatar URL (optional)
    let avatarUrl: string | null = null;
    if (row.avatar) {
      const avatarRes = await db.execute(
        'SELECT image FROM images WHERE id = ?',
        [row.avatar]
      );
      avatarUrl =
        typeof avatarRes.rows[0]?.image === 'string'
          ? avatarRes.rows[0].image
          : null;
    }

    // 3) Return payload
    return NextResponse.json({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: avatarUrl,
      referralCode: row.referralCode,
    });
  } catch (err) {
    console.error('/api/mobileBackend/user error:', err);
    const status =
      err instanceof TokenExpiredError || err instanceof UnauthorizedError
        ? 401
        : 500;
    const msg = status === 401 ? 'Unauthorized' : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status });
  }
}
