import { NextRequest, NextResponse } from 'next/server';

// Edge runtime for Cloudflare Workers
export const runtime = 'nodejs';

// Ensure API key is set
if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    'OpenAI API key ontbreekt. Stel de OPENAI_API_KEY omgevingsvariabele in.'
  );
}

/**
 * Transcribe a single audio chunk via OpenAI Audio API
 */
async function transcribeAudio(file: File): Promise<string> {
  // 1) Zet de incoming File om in een ArrayBuffer
  const buffer = await file.arrayBuffer();
  // 2) Maak er een Blob van met de juiste MIME-type
  const blob = new Blob([buffer], { type: file.type });
  
  const form = new FormData();
  // 3) Voeg nu wél een echte Blob toe
  form.append("file", blob, file.name);
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "nl");

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: form as any,
    cache: 'no-store',              
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Transcription error:', errorText);
    throw new Error('Transcription mislukt voor een chunk: ' + errorText);
  }

  const json = await res.json();
  return (json.text || '').trim();
}

/**
 * Summarize the full transcript via function calling
 */
async function summarizeTranscript(fullText: string): Promise<{
  summary: string;
  actionItems: string;
  qna: string;
}> {

  const payload = {
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "Je bent een transcript-samenvatter die alleen JSON retourneert.",
      },
      {
        role: "user",
        content: `
          Vat dit transcript samen in JSON met de volgende keys:
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
    temperature: 0.4,
  };
  
  console.log(payload);

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Summarization error:', err);
    throw new Error('Samenvatten mislukt: ' + err);
  }

  const json = await res.json();
  const message = json.choices[0].message;
let data;

if (message.function_call) {
  // parse de arguments zoals je al had
  const args = message.function_call.arguments;
  data = typeof args === 'string' ? JSON.parse(args) : args;
} else {
  // fallback: strip eerst ```json … ```
  let content = message.content.trim();

  // regex: verwijder ```json\n aan het begin en ``` aan het eind
  content = content
    .replace(/^```(?:json)?\s*/, '')   // verwijder opening fence
    .replace(/```$/, '');              // verwijder sluitende fence

  try {
    data = JSON.parse(content);
  } catch (err) {
    throw new Error("Kon zelfs na strippen niet parsen:\n" + content);
  }
}


  return {
    summary: data.summary || '',
    actionItems: data.actionItems || '',
    qna: data.qna || '',
  };
}

export async function POST(request: NextRequest) {
  try {
    
    const formData = await request.formData();
    // Collect all uploaded chunks
    const rawFiles = formData.getAll('audioFile');
    const chunks: File[] = rawFiles.filter((f) => f instanceof File) as File[];

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'Geen audioFile chunk(s) gevonden' },
        { status: 400 }
      );
    }

    // Sequentially transcribe each chunk
    const transcripts: string[] = [];
    for (const chunk of chunks) {
      const text = await transcribeAudio(chunk);
      console.log(text);
      transcripts.push(text);
    }

    // Combine all transcripts
    const fullText = transcripts.join('\n').trim();

    // Optionally summarize combined transcript
    let summary = '';
    let actionItems = '';
    let qna = '';
    console.log('Samenvatten:', formData.get('enableSummarization')); 

    if (formData.get('enableSummarization') === 'true') {
      console.log("Generat  ing summary...");
      const parsed = await summarizeTranscript(fullText);
      console.log(parsed)
      summary = parsed.summary;
      actionItems = parsed.actionItems;
      qna = parsed.qna;

    }

    return NextResponse.json({ text: fullText, summary, actionItems, qna });
  } catch (err: any) {
    console.error('Error in Edge function /api/transcribe:', err);
    return NextResponse.json(
      { error: err.message || 'Er is een interne fout opgetreden.' },
      { status: 500 }
    );
  }
}
