// app/api/transcribe/route.ts
// export const runtime = "edge";

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import OpenAI from 'openai';

type QnaItem = { question: string; answer: string };

type SummarizeResponse = {
  summaryMd: string;       // Markdown
  actionItemsMd: string;   // Markdown (bv. lijstjes)
  qna: QnaItem[];          // Gestructureerd, geen markdown nodig hier
};

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
async function transcribeViaAzure(file: File, inputField: string): Promise<string> {
  const form = new FormData();
  form.append("audioFile", file, file.name);
  form.append("prompt", inputField);

  const res = await fetch(AZURE_FUNCTION_URL!, {
    method: "POST",
    body: form as any,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Azure Function error (status ${res.status}):`, text);
    throw new Error('TRANSCRIBE_ERROR');
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error(`Expected JSON but got ${contentType}:`, text);
    throw new Error('TRANSCRIBE_ERROR');
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    const text = await res.text();
    console.error("Invalid JSON from Azure Function:", text);
    throw new Error('TRANSCRIBE_ERROR');
  }

  if (typeof payload.transcript !== "string") {
    console.error("Azure Function returned unexpected payload:", payload);
    throw new Error('TRANSCRIBE_ERROR');
  }

  return payload.transcript.trim();
}

/**
 * Summarize the full transcript via Grok 3 Mini on xAI.
 */



async function summarizeTranscript(
  fullText: string,
  detectedLang: string,
  inputField: string  
): Promise<{ summary: string; actionItems: string; qna: string }> {
  const grokClient = new OpenAI({ apiKey: GROK_API_KEY!, baseURL: GROK_BASE_URL! });

  const completion = await grokClient.chat.completions.create({
    model: "grok-3-mini",
    messages: [
      { role: "system", content: `Je retourneert **uitsluitend geldige JSON** (geen code fences, geen uitleg erbuiten).
Gebruik Tailwind CSS classes. voor de styling van de samenvatting en actionpoints. Denk aan font, grootte, kopjes, alinea's etc. Houdt de styling professioneel en leesbaar.
  ` },
      {
        role: "user",
        content: `
          %${fullText}%
          Act as a professional summarizer. Create a concise and comprehensive summary of the text enclosed in %% above, while adhering to the guidelines enclosed in [ ] below. 

          Guidelines:  

          [ 

          Create a summary in the language that the text is in, that is detailed, thorough, in-depth, and complex, while maintaining clarity and conciseness. 
          The summary must cover all the key points and main ideas presented in the original text, while also condensing the information into a concise and easy-to-understand format. 
          Ensure that the summary includes relevant details and examples that support the main ideas, while avoiding any unnecessary information or repetition. 
          Rely strictly on the provided text, without including external information. 
          The length of the summary must be appropriate for the length and complexity of the original text. The length must allow to capture the main points and key details, without being overly long. A good reference point is that the summary must be around 0.4-0.6 times the length of the original text.  
          Ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. Format each section in paragraph form.
          ActionItems must only be actionitems no header or title, only action items, use a clear list format with Tailwind CSS classes.
          Give an array "qna" with all questions and their answers. Each element must have the exact format
          The following input was given by the user about the transcript: %{inputField}% 
          [
            {
              "question": "The full question here",
              "answer": "The full answer here"
            },
            …
          ]
          Return it in json format with the following structure:
          {
            "summary": string (Tailwind css classes),      // Summary of the text in the same language as the text
            "actionItems": string  (Tailwind css classes, gebruik een duidelijk lijstje),  // A separate section with action items that are present in the original text
            "qna": string           // apart kopje met alle vragen in de originele tekst en bijbehorende antwoorden
          }
          ]`.trim(),
      },
    ],
    temperature: 0.5,
  });

  const msg = completion.choices?.[0]?.message;
  if (!msg) throw new Error('SUMMARIZE_ERROR');

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
    throw new Error('SUMMARIZE_ERROR');
  }

  return {
    summary: data.summary || "",
    actionItems: data.actionItems || "",
    qna: data.qna || "",
  };
}

export async function POST(request: NextRequest) {
  await requireAuth(request.headers);
  // Debug environment variables
  console.log("/api/transcribe POST - ENV", {
    AZURE_FUNCTION_URL: AZURE_FUNCTION_URL || null,
    GROK_API_KEY: GROK_API_KEY ? true : false,
    GROK_BASE_URL: GROK_BASE_URL || null,
  });
  // 1) Validate environment
  if (!AZURE_FUNCTION_URL || !GROK_API_KEY || !GROK_BASE_URL) {
    console.error("Missing configuration for transcription service");
    return NextResponse.json(
      { error: "Configuratiefout op de server." },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("audioFile");
    const inputField = formData.get("extraInfo") as string | "";
    

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Geen audioFile gevonden in de upload." }, { status: 400 });
    }

    // 2) Transcribe via Azure
    const fullText = await transcribeViaAzure(file,inputField);



    // // 3) Summarize via Grok
    const { summary, actionItems, qna } = await summarizeTranscript(fullText, "nl", inputField);



    // 4) Return JSON
    return NextResponse.json({ text: fullText, summary, actionItems, qna }, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/transcribe:", err);
    return NextResponse.json(
      { error: "Er is een fout opgetreden tijdens het verwerken. Probeer het later opnieuw." },
      { status: 500 }
    );
  }
}
