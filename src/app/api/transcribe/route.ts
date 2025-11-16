export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const MESSAGE =
  "Deze endpoint is vervangen door de nieuwe, asynchrone transcribe-flow. " +
  "Upload je audio direct naar Azure via de presigned upload en gebruik " +
  "/api/mobileBackend/transcribe/start + /status voor de voortgang.";

export async function POST() {
  return NextResponse.json({ error: MESSAGE }, { status: 410 });
}

