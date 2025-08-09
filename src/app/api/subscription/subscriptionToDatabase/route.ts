// src/app/api/subscription/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from "@/lib/requireAuth"
import { getTursoClient } from '@/lib/turso';
import crypto from 'crypto';

interface SubscriptionBody {
  stripeSubscriptionId: string;
  expirationDate: string;      // ISO‑string, bijv. "2025-08-25T12:00:00.000Z"
  subscriptionType: string;    // bijv. "basic" | "premium"
}

export async function GET(req: NextRequest) {
  const payload = await requireAuth(req.headers);
  const userId = String(payload.sub);
  const db = getTursoClient();

  // 2) haal subscription(s) op voor deze user
  const res = await db.execute(
    'SELECT stripe_id AS stripeSubscriptionId, expiration_date AS expirationDate, subscription_type AS subscriptionType FROM subscriptions WHERE user_id = ?',
    [userId]
  );

  return NextResponse.json({ subscriptions: res.rows });
}

export async function POST(req: NextRequest) {
  const payload = await requireAuth(req.headers);
  const userId = String(payload.sub);

  // 2) parse en valideer body
  let body: SubscriptionBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('Received subscription data:', body); 
  const { stripeSubscriptionId, expirationDate, subscriptionType } = body;
  const now = new Date();
  const nextMonth = new Date(now);
  nextMonth.setMonth(now.getMonth() + 1);
  const expirationDateOneMonth = nextMonth.toISOString().split('T')[0];

  

  // 3) upsert in DB
  const db = getTursoClient();

  // check of er al een record voor deze user bestaat
  const existing = await db.execute(
    'SELECT id FROM subscription WHERE user_id = ?',
    [userId]
  );

  if (existing.rows.length > 0) {
    // update
    await db.execute(
      `UPDATE subscription
         SET stripe_id        = ?,
             expiration_date  = ?,
             subscription_type = ?
       WHERE user_id = ?`,
      [stripeSubscriptionId, expirationDateOneMonth, subscriptionType, userId]
    );
  } else {
    // insert
    const id = crypto.randomUUID();
    await db.execute(
      `INSERT INTO subscription
         ( user_id, stripe_id, expiration_date, subscription_type)
       VALUES ( ?, ?, ?, ?)`,
      [ userId, stripeSubscriptionId, expirationDateOneMonth, subscriptionType]
    );
  }

  return NextResponse.json({ success: true });
}
