import { NextRequest, NextResponse } from 'next/server';
import { splitAudioServer } from '@/lib/serverSplit';

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
/**
 * Transcribe a single chunk, met optionele taalhint
 */
const languageMap: Record<string,string> = {
  netherlands: "nl",
  dutch:       "nl",
  english:     "en",
};

async function transcribeAudio(file: File, language?: string): Promise<string> {
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], { type: file.type });

  const form = new FormData();
  form.append("file", blob, file.name);
  form.append("model", "gpt-4o-mini-transcribe");

  // only append a language hint if it's one we recognize
  if (language) {
    const code = languageMap[language.toLowerCase()];
    if (code) {
      form.append("language", code);
      console.log("Using language hint:", code);
    } else {
      console.log("Unrecognized language:", language, "— skipping language hint");
    }
    if (language === 'english') {
      language = 'en';
    }
    if (language === 'dutch') {
      language = 'nl';
    }
    if (language === 'netherlands') {
      language = 'nl';
    } 
    form.append("language", language);

  }

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form as any,
    cache: "no-store",
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
 * Detecteert de taal van één audio-chunk
 */
/**
 * Detecteert de taal van één audio-chunk via whisper-1
 */
async function detectLanguage(file: File, maxBytes = 5 * 1024 * 1024): Promise<string> {
  // Snijd een sample af (max 5 MB of minder als de file kleiner is)
  const sample = file.slice(0, Math.min(file.size, maxBytes), file.type);

  const buffer = await sample.arrayBuffer();
  const blob = new Blob([buffer], { type: file.type });

  

  const form = new FormData();
  form.append("file", blob, file.name);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

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
    throw new Error('Taal detectie mislukt: ');
  }

  const json = await res.json();
  return json.language; // b.v. "nl" of "en"
}




/**
 * Summarize the full transcript via function calling
 */
async function summarizeTranscript(fullText: string, detectedLang: string): Promise<{
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


Door deze geoptimaliseerde prompt te volgen, genereer je een effectieve samenvatting die de essentie van de tekst op een duidelijke, beknopte en leesvriendelijke manier samenvat.
     Gebruik titels en bulletpoints om het overzichtelijk te houden. Wanneer je een titel maakt gebruik dan de tag <b>titel</b> 
      Een goede lengte voor een samenvatting is de helft van de originele transcriptie. Als de samenvatting 5000 woorden is dan is het een goed uitgangspunt om rond de 2500 woorden te hebben. Zolang er geen dubbele/onnodige informatie in komt te staan om zo alleen maar de ruimte op te vullen. Daarnaast wil ik ook een aparte kop voor actiepunten die benoemd zijn in het transcript. Actiepunten zijn dingen die gezegd zijn in het transcript die iemand moet gaan doen of gaan uitvoeren. Daarnaast wil ik alle vragen die gesteld zijn en de daarbij behorende antwoorden in een aparte kop genaamd qna. Geef de output in JSON met de volgende keys:
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
  console.log(data);

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
    let chunks: File[] = rawFiles.filter((f) => f instanceof File) as File[];

    if (chunks.length === 1) {
      // client sent a single file; split server-side
      chunks = await splitAudioServer(chunks[0]);
    }

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: 'Geen audioFile chunk(s) gevonden' },
        { status: 400 }
      );
    }

    const detectedLang = await detectLanguage(chunks[0]);

    // Sequentially transcribe each chunk
    const transcripts: string[] = [];
    for (const chunk of chunks) {
      const text = await transcribeAudio(chunk, detectedLang);
      transcripts.push(text);
    }

    const fullText = transcripts.join('\n').trim();

    // Optionally summarize combined transcript
    let summary = '';
    let actionItems = '';
    let qna = '';

    if (formData.get('enableSummarization') === 'true') {
      const parsed = await summarizeTranscript(fullText, detectedLang);
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
