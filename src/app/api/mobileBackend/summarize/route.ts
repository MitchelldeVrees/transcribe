// src/app/api/mobileBackend/summarize/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/requireAuth';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_BASE_URL;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// --- helpers to make JSON parsing resilient while keeping HTML intact ---
function stripCodeFences(s: string) {
  const m = s?.match?.(/```json([\s\S]*?)```/i);
  return m ? m[1].trim() : (s || '').trim();
}

// Replace invalid JSON escapes (like \'), and remove stray backslashes
function fixIllegalJsonEscapes(s: string) {
  return s
    .replace(/\\'/g, "'")
    .replace(/\\(?!["\\/bfnrtu])/g, '');
}

async function summarizeTranscript(
  fullText: string,
  inputField: string
): Promise<{ summary: string; actionItems: string; qna: string }> {
  const client = new OpenAI({ apiKey: GROK_API_KEY!, baseURL: GROK_BASE_URL! });

  const completion = await client.chat.completions.create({
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
  if (!msg) throw new Error('SUMMARIZE_ERROR_NO_MESSAGE');

  // Prefer function_call args if present; else use content
  let rawOut =
    msg.function_call
      ? (typeof msg.function_call.arguments === 'string'
          ? msg.function_call.arguments
          : JSON.stringify(msg.function_call.arguments))
      : (msg.content || '');

  // Remove any fences and repair escapes before parsing
  let toParse = stripCodeFences(rawOut);
  let data: any;
  try {
    data = JSON.parse(toParse);
  } catch {
    data = JSON.parse(fixIllegalJsonEscapes(toParse));
  }

  return {
    summary: typeof data.summary === 'string' ? data.summary : '',
    actionItems: typeof data.actionItems === 'string' ? data.actionItems : '',
    qna: typeof data.qna === 'string' ? data.qna : '',
  };
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth(req.headers);

    if (!GROK_API_KEY || !GROK_BASE_URL) {
      return jsonError('LLM configuration missing', 500);
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body.text || '');
    const extraInfo = String(body.extraInfo || '');

    if (!text || text.length < 20) return jsonError('No text', 400);

    const { summary, actionItems, qna } = await summarizeTranscript(text, extraInfo);
    return NextResponse.json({ summary, actionItems, qna }, { status: 200 });
  } catch (e: any) {
    console.error('Error in /api/mobileBackend/summarize:', e?.message || e, e?.stack);
    const msg = e?.message || String(e);
    const isAuth = msg.includes('Unauthorized');
    return jsonError(isAuth ? 'Unauthorized' : 'Internal Server Error', isAuth ? 401 : 500);
  }
}
