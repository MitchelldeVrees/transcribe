import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Azure Function URL (unchanged)
const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
if (!AZURE_FUNCTION_URL) {
  throw new Error(
    "De Azure Function URL ontbreekt. Stel de AZURE_FUNCTION_URL-omgevingsvariabele in."
  );
}

// Grok (x.ai) client setup
const GROK_API_KEY = process.env.GROK_API_KEY;
const GROK_BASE_URL = process.env.GROK_BASE_URL; // e.g. "https://api.x.ai/v1"

if (!GROK_API_KEY) {
  throw new Error("Grok API key ontbreekt. Stel de GROK_API_KEY-omgevingsvariabele in.");
}
if (!GROK_BASE_URL) {
  throw new Error("Grok base URL ontbreekt. Stel de GROK_BASE_URL-omgevingsvariabele in.");
}

const grokClient = new OpenAI({
  apiKey: GROK_API_KEY,
  baseURL: GROK_BASE_URL,
});

/**
 * Sends a single File object to the Azure Function and returns the "transcript" string.
 */
async function transcribeViaAzure(file: File): Promise<string> {
  const form = new FormData();
  form.append("audioFile", file, file.name);

  if (!AZURE_FUNCTION_URL) {
    throw new Error("AZURE_FUNCTION_URL is not defined.");
  }
  const res = await fetch(AZURE_FUNCTION_URL, {
    method: "POST",
    body: form as any,
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Azure Function returned error:", errorText);
    throw new Error(`Azure transcriptie mislukt: ${errorText}`);
  }

  const json = await res.json();
  if (typeof json.transcript !== "string") {
    console.error("Ongeldig antwoord van Azure:", json);
    throw new Error("Ongeldig antwoord van Azure Function (geen transcript-veld).");
  }
  return json.transcript.trim();
}

/**
 * Summarize the full transcript via Grok 3 Mini on xAI.
 */
async function summarizeTranscript(
  fullText: string,
  detectedLang: string
): Promise<{
  summary: string;
  actionItems: string;
  qna: string;
}> {
  const completion = await grokClient.chat.completions.create({
    model: "grok-3-mini",
    messages: [
      {
        role: "system",
        content: "Je bent een transcript-samenvatter die alleen JSON retourneert.",
      },
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
Return it in json format with the following structure:
{
  "summary": string,      // samenvatting van de tekst
  "actionItems": string,  // apart kopje met actiepunten die in de originele tekst staan
  "qna": string           // apart kopje met alle vragen in de originele tekst en bijbehorende antwoorden
}
]`.trim(),
      },
    ],
    temperature: 0.5,
  });

  const msg = completion.choices?.[0]?.message;
  if (!msg) {
    throw new Error("Geen geldig antwoord van Grok.");
  }

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
  try {
    const formData = await request.formData();

    // debug: print every key + value
    for (const [key, value] of formData.entries()) {
      console.log("[transcribe] form field:", key, value);
    }
    const file = formData.get("audioFile");
    console.log(file);
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Geen audioFile gevonden in de upload." },
        { status: 400 }
      );
    }

    // 1) Send the single file to Azure for transcription
    const fullText = await transcribeViaAzure(file);

    // 2) Summarize via Grok
    const detectedLang = "nl"; // of detecteer dynamisch
    const { summary, actionItems, qna } = await summarizeTranscript(fullText, detectedLang);

    // 3) Return transcript + summary
    return NextResponse.json(
      {
        text: fullText,
        summary,
        actionItems,
        qna,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in Edge function /api/transcribe:", err);
    return NextResponse.json(
      { error: err.message || "Er is een interne fout opgetreden." },
      { status: 500 }
    );
  }
}
