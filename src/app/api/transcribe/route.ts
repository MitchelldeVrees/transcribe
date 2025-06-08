// app/api/transcribe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

console.log("Loading /api/transcribe route...");
// Environment variables (no top-level throws)
const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_BASE_URL;
console.log("Environment variables loaded:", {
  AZURE_FUNCTION_URL: !!AZURE_FUNCTION_URL,
  GROK_API_KEY: !!GROK_API_KEY,
  GROK_BASE_URL: !!GROK_BASE_URL,
});

/**
 * Sends a single File object to the Azure Function and returns the "transcript" string.
 */
async function transcribeViaAzure(file: File): Promise<string> {
  const form = new FormData();
  form.append("audioFile", file, file.name);

  const res = await fetch(AZURE_FUNCTION_URL!, {
    method: "POST",
    body: form as any,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Azure Function error (status ${res.status}):`, text);
    throw new Error(`Azure transcriptie mislukt: ${text}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error(`Expected JSON but got ${contentType}:`, text);
    throw new Error(`Azure transcriptie mislukt: onverwacht response type ${contentType}`);
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    const text = await res.text();
    console.error("Invalid JSON from Azure Function:", text);
    throw new Error("Azure transcriptie mislukt: ongeldige JSON response");
  }

  if (typeof payload.transcript !== "string") {
    console.error("Azure Function returned unexpected payload:", payload);
    throw new Error("Ongeldig antwoord van Azure (geen transcript-veld).");
  }

  return payload.transcript.trim();
}

/**
 * Summarize the full transcript via Grok 3 Mini on xAI.
 */
async function summarizeTranscript(
  fullText: string,
  detectedLang: string
): Promise<{ summary: string; actionItems: string; qna: string }> {
  const grokClient = new OpenAI({ apiKey: GROK_API_KEY!, baseURL: GROK_BASE_URL! });

  const completion = await grokClient.chat.completions.create({
    model: "grok-3-mini",
    messages: [
      { role: "system", content: "Je bent een transcript-samenvatter die alleen JSON retourneert." },
      { role: "user", content: `
%${fullText}%
Act as a professional summarizer. Create a concise and comprehensive summary of the text enclosed in %% above, while adhering to the guidelines in [ ] below.
[ ... guidelines omitted for brevity ... ]
Return JSON with {"summary": string, "actionItems": string, "qna": string}.
`.trim() },
    ],
    temperature: 0.5,
  });

  const msg = completion.choices?.[0]?.message;
  if (!msg) throw new Error("Geen geldig antwoord van Grok.");

  let data: any;
  try {
    if (msg.function_call) {
      const args = msg.function_call.arguments;
      data = typeof args === "string" ? JSON.parse(args) : args;
    } else {
      let txt = msg.content?.trim() || '';
      txt = txt.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
      data = JSON.parse(txt);
    }
  } catch (err) {
    console.error("JSON parse error:", err, "raw:", msg.content);
    throw new Error("Kon niet parsen van Grok-antwoord.");
  }

  return {
    summary: data.summary || "",
    actionItems: data.actionItems || "",
    qna: data.qna || "",
  };
}

export async function POST(request: NextRequest) {
  // Debug environment variables
  console.log("/api/transcribe POST - ENV", {
    AZURE_FUNCTION_URL: AZURE_FUNCTION_URL || null,
    GROK_API_KEY: GROK_API_KEY ? true : false,
    GROK_BASE_URL: GROK_BASE_URL || null,
  });
  // 1) Validate environment
  if (!AZURE_FUNCTION_URL) {
    return NextResponse.json({ error: "Azure Function URL ontbreekt (env AZURE_FUNCTION_URL)." }, { status: 500 });
  }
  if (!GROK_API_KEY || !GROK_BASE_URL) {
    return NextResponse.json({ error: "Grok credentials ontbreken (env GROK_API_KEY/GROK_BASE_URL)." }, { status: 500 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("audioFile");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Geen audioFile gevonden in de upload." }, { status: 400 });
    }

    // 2) Transcribe via Azure
    const fullText = await transcribeViaAzure(file);

    // 3) Summarize via Grok
    const { summary, actionItems, qna } = await summarizeTranscript(fullText, "nl");

    // 4) Return JSON
    return NextResponse.json({ text: fullText, summary, actionItems, qna }, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/transcribe:", err);
    return NextResponse.json({ error: err.message || "Interne serverfout" }, { status: 500 });
  }
}
