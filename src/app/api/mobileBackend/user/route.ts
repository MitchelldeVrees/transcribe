// src/app/api/mobileBackend/user/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getTursoClient } from '@/lib/turso';
import { requireAuth, TokenExpiredError, UnauthorizedError } from '@/lib/requireAuth';
import { ensureReferralPromptColumn } from '@/lib/user';
import {
  ensureReferralSchema,
  ensureReferralCodeRecord,
  getCreditBalance,
  referralCreditIncrement,
} from '@/lib/referrals';
import { generateReferralCode } from '@/lib/referral';
import { ensureDefaultPlan } from '@/lib/plans';

export async function POST(req: NextRequest) {
  try {
    // 1) Authenticate (throws TokenExpiredError/UnauthorizedError on problems)
    const me = await requireAuth(req.headers);
    const subId = String(me.sub);
    const email = typeof me.email === 'string' ? me.email : '';
    const name = typeof me.name === 'string' ? me.name : '';

    // 2) Fetch user record
    const db = getTursoClient();
    await ensureReferralPromptColumn(db);
    await ensureReferralSchema(db);

    let isNewUser = false;

    let userRes = await db.execute(
      `SELECT id, name, email, avatar, referralCode
         FROM users
        WHERE subId = ?
        LIMIT 1`,
      [subId]
    );

    if (userRes.rows.length === 0) {
      
      isNewUser = true;
      const referralCode = generateReferralCode(email);
      const createdISO = new Date().toISOString();

      await db.execute(
        `INSERT INTO users (subId, email, name, avatar, created, referralCode)
         VALUES (?, ?, ?, NULL, ?, ?)`,
        [subId, email, name, createdISO, referralCode]
      );

      await ensureDefaultPlan(db, subId, createdISO);
      await ensureReferralCodeRecord(db, {
        code: referralCode,
        ownerUserId: subId,
        ownerSubId: subId,
      });

      userRes = await db.execute(
        `SELECT id, name, email, avatar, referralCode
           FROM users
          WHERE subId = ?
          LIMIT 1`,
        [subId]
      );
    }

    const row = userRes.rows[0] as any;

    if (row?.referralCode) {
      await ensureReferralCodeRecord(db, {
        code: String(row.referralCode),
        ownerUserId: String(row.id ?? subId),
        ownerSubId: subId,
      });
    }

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


    const statusCode = isNewUser ? 201 : 200;
    
    // Get credit balance
    const credits = await getCreditBalance(db, subId);
    
    // 3) Return payload
    return NextResponse.json({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: avatarUrl,
      referralCode: row.referralCode,
      isNewUser,
      referralCreditIncrement: referralCreditIncrement(),
      credits,
    }, { status: statusCode });
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
