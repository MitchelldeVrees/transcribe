import { NextRequest, NextResponse } from 'next/server';

// The Azure Function’s URL must be set in your environment.
// Example: AZURE_FUNCTION_URL="https://myfuncapp.azurewebsites.net/api/HttpTrigger2"
const AZURE_FUNCTION_URL = process.env.AZURE_FUNCTION_URL;
if (!AZURE_FUNCTION_URL) {
  throw new Error(
    "De Azure Function URL ontbreekt. Stel de AZURE_FUNCTION_URL-omgevingsvariabele in."
  );
}

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
    // Note: no need for special headers; fetch will set the correct multipart boundary.
    cache: "no-store",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Azure Function returned error:", errorText);
    throw new Error(`Azure transcriptie mislukt: ${errorText}`);
  }

  const json = await res.json();
  // We expect the Azure function to return: { "transcript": "…" }
  if (typeof json.transcript !== "string") {
    console.error("Ongeldig antwoord van Azure:", json);
    throw new Error("Ongeldig antwoord van Azure Function (geen transcript-veld).");
  }
  return json.transcript.trim();
}

/**
 * Summarize the full transcript via OpenAI function calling (unchanged).
 * 
 * (Reuse your existing summarizeTranscript function verbatim, since it still
 * hits the OpenAI Chat completions endpoint.)
 */
async function summarizeTranscript(
  fullText: string,
  detectedLang: string
): Promise<{
  summary: string;
  actionItems: string;
  qna: string;
}> {
  const payload = {
    model: "gpt-4.1",
    messages: [
      {
        role: "system",
        content: "Je bent een transcript-samenvatter die alleen JSON retourneert.",
      },
      {
        role: "user",
        content: `
          Ik heb een transcript voor jou in de Taal:"${detectedLang}". 
          Als er geen taal is gedefineerd gebruik dan de taal van de input/transcript. 
          Er kunnen spelfouten in de transcriptie zitten. Verbeter de spelfouten en maak een samenvatting. 
          
          Maak als professionele samenvatter een beknopte en uitgebreide samenvatting van de aangeleverde tekst, of het nu een artikel, bericht, conversatie of passage betreft, en houd je daarbij aan de volgende richtlijnen:

          Maak een samenvatting die gedetailleerd, grondig, diepgaand en complex is, maar zorg wel voor helderheid en beknoptheid.
          Neem de belangrijkste ideeën en essentiële informatie op, vermijd overbodige taal en concentreer je op kritische aspecten.
          Vertrouw strikt op de aangeleverde tekst, zonder externe informatie.
          Maak de samenvatting op in alineavorm voor een gemakkelijk begrip.
          Gebruik titels en bulletpoints om het overzichtelijk te houden. Wanneer je een titel maakt gebruik dan de tag <b>titel</b>. 
          Een goede lengte voor een samenvatting is de helft van de originele transcriptie. 
          Daarnaast wil ik ook een aparte kop voor actiepunten die benoemd zijn in het transcript.
          Daarnaast wil ik alle vragen die gesteld zijn en de daarbij behorende antwoorden in een aparte kop genaamd qna.
          Geef de output in JSON met de volgende keys:
          {
            "summary": string,
            "actionItems": string,
            "qna": string
          }
          Transcript:
          ${fullText}
        `,
      },
    ],
    temperature: 0.5,
  };

  // Make sure you have set your OPENAI_API_KEY in environment for Next.js runtime
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key ontbreekt. Stel de OPENAI_API_KEY-omgevingsvariabele in.");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Samenvatting mislukt:", err);
    throw new Error("Samenvatting mislukt: " + err);
  }

  const json = await res.json();
  const message = json.choices?.[0]?.message;
  if (!message) {
    throw new Error("Geen geldig antwoord van samenvatting API.");
  }

  let data: any;
  if (message.function_call) {
    const args = message.function_call.arguments;
    data = typeof args === "string" ? JSON.parse(args) : args;
  } else {
    let content = String(message.content).trim();
    content = content.replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
    try {
      data = JSON.parse(content);
    } catch (err) {
      throw new Error("Kon niet parsen na strippen:\n" + content);
    }
  }

  return {
    summary: data.summary || "",
    actionItems: data.actionItems || "",
    qna: data.qna || "",
  };
}

export async function POST(request: NextRequest) {
  try {
    // 1) We expect a multipart/form-data POST containing one or more fields "audioFile"
    const formData = await request.formData();
    const rawFiles = formData.getAll("audioFile");
    const chunks: File[] = rawFiles.filter((f) => f instanceof File) as File[];

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Geen audioFile chunk(s) gevonden." },
        { status: 400 }
      );
    }

    // 2) Sequentially send each chunk to the Azure Function
    const transcripts: string[] = [];
    for (const chunk of chunks) {
      const text = await transcribeViaAzure(chunk);
      transcripts.push(text);
    }
    console.log(transcripts);

    // 3) Combine all received transcripts into one full text
    const fullText = transcripts.join("\n").trim();

    // 4) If summarization is requested, run summarizeTranscript()
    let summary = "";
    let actionItems = "";
    let qna = "";
    
      // If you need a detected language, you can either hardcode "nl"/"en" 
      // or add a client‐side languageDetection step. For now, we’ll default to "nl".
      const detectedLang = "nl"; 
      const parsed = await summarizeTranscript(fullText, detectedLang);
      summary = parsed.summary;
      actionItems = parsed.actionItems;
      qna = parsed.qna;
    

    // 5) Return JSON with the combined transcript and optional summary
    return NextResponse.json(
      { text: fullText, summary, actionItems, qna },
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
