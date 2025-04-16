import { NextResponse } from 'next/server';
import { AssemblyAI } from 'assemblyai';

export const config = {
  api: {
    bodyParser: false,
  },
};

const assemblyClient = new AssemblyAI({
  apiKey: '1797e257273844e29de84d5063c1bfa3'
});

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('audioFile') as File;
  const transcriptionModel = formData.get("transcriptionModel")?.toString() || "assembly";
  const enableSummarization = formData.get("enableSummarization")?.toString() === "true";

  console.log("Using transcription model:", transcriptionModel);
  console.log("Summarization enabled:", enableSummarization);
  console.log("File:", file);

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  try {
    if (transcriptionModel === "openai") {
      // --- OpenAI Transcription ---
      const openaiFormData = new FormData();
      openaiFormData.append("file", file, file.name);
      openaiFormData.append("model", "whisper-1");
      openaiFormData.append("language", "nl");
      
      const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: openaiFormData,
      });
      const openaiData = await openaiResponse.json();
      
      if (!openaiResponse.ok) {
        return NextResponse.json({
          error: openaiData.error ? openaiData.error.message : "OpenAI transcription failed"
        }, { status: 500 });
      }
      
      const transcriptText = openaiData.text;
      
      if (enableSummarization) {
        const summarizationPrompt = `Lees het volgende transcript en geef een overzicht in drie delen:

1. **Bullet-point Samenvatting:** Een korte puntenlijst met de belangrijkste punten.
2. **Actiepunten en Taken:** Concrete acties, taken of beslissingen uit het gesprek.
3. **Q&A:** Als er belangrijke vragen gesteld en beantwoord zijn, vermeld deze dan.

Transcript:\n\n${transcriptText}`;
        
        const summarizationResponse = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system",
                content: "Je bent een behulpzame assistent die Nederlandse transcripties samenvat en actiepunten extraheert."
              },
              {
                role: "user",
                content: summarizationPrompt
              }
            ],
            temperature: 0.5,
          })
        });
        const summarizationData = await summarizationResponse.json();
        if (!summarizationResponse.ok) {
          return NextResponse.json({
            error: summarizationData.error?.message || "OpenAI summarization failed"
          }, { status: 500 });
        }
        
        const fullResponse = summarizationData.choices[0].message.content;
        console.log('Full response:', fullResponse);
        
        const summaryMatch = fullResponse.match(/(?<=\*\*Bullet-point Samenvatting:\*\*)([\s\S]*?)(?=\*\*Actiepunten en Taken:\*\*)/i);
        const actionItemsMatch = fullResponse.match(/(?<=\*\*Actiepunten en Taken:\*\*)([\s\S]*?)(?=\*\*Q&A:\*\*)/i);
        const qnaMatch = fullResponse.match(/(?<=\*\*Q&A:\*\*)([\s\S]*)/i);
        
        const summary = summaryMatch ? summaryMatch[0].trim() : fullResponse;
        const actionItems = actionItemsMatch ? actionItemsMatch[0].trim() : "";
        const qna = qnaMatch ? qnaMatch[0].trim() : "";
        
        console.log('Summary:', summary);
        console.log('Action Items:', actionItems);
        console.log('Q&A:', qna);
        
        return NextResponse.json({ text: transcriptText, summary, actionItems, qna });
      }
      
      return NextResponse.json({ text: transcriptText });
      
    } else {
      // --- AssemblyAI Transcription with Speaker Labels ---
      console.log('File received:', file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      console.log('Buffer created:', buffer.length);

      const uploadUrl = await assemblyClient.files.upload(buffer);
      console.log('File uploaded to:', uploadUrl);
      
      const transcriptionParams: any = {
        audio_url: uploadUrl,
        language_code: "nl",
        speech_model: "best",
        speaker_labels: true
      };

      const transcriptJob = await assemblyClient.transcripts.create(transcriptionParams);
      console.log('Transcription job created:', transcriptJob.id);
      
      let polling = await assemblyClient.transcripts.get(transcriptJob.id);
      while (polling.status !== 'completed' && polling.status !== 'error') {
        await new Promise((res) => setTimeout(res, 3000));
        polling = await assemblyClient.transcripts.get(transcriptJob.id);
      }
      
      if (polling.status === 'error') {
        return NextResponse.json({ error: polling.error }, { status: 500 });
      }
      
      // Format speakers' information if available
      let speakersTranscript = "";
      if (polling.utterances && polling.utterances.length > 0) {
        speakersTranscript = polling.utterances
          .map((utterance: any) => `Speaker ${utterance.speaker}: ${utterance.text}`)
          .join("\n");
      }
      
      return NextResponse.json({
        text: polling.text,
        speakers: speakersTranscript,  // New field for speaker-by-speaker transcript
        summary: polling.summary || null,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
