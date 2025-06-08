import { NextResponse } from 'next/server';

export async function GET() {
  console.log('💡 health endpoint hit');
  return NextResponse.json({ ok: true });
}
