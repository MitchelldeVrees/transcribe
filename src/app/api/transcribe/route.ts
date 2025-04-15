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
  // Read transcription model and summarization flag from form data
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
      // Prepare form data for OpenAI transcription request
      const openaiFormData = new FormData();
      openaiFormData.append("file", file, file.name);
      openaiFormData.append("model", "whisper-1");
      openaiFormData.append("language", "nl");
      
      const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
          // Content-Type is set automatically when using FormData
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
      
      // If summarization is enabled, call the OpenAI Chat Completion endpoint
      if (enableSummarization) {
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
                content: "Je bent een behulpzame assistent die Nederlandse transcripties samenvat."
              },
              {
                role: "user",
                content: `Gelieve het volgende transcript samen te vatten:\n\n${transcriptText}`
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
        
        const summary = summarizationData.choices[0].message.content;
        console.log('Summary:', summary);
        return NextResponse.json({ text: transcriptText, summary });
      }
      
      return NextResponse.json({ text: transcriptText });
    } else {
      // --- AssemblyAI Transcription ---
      console.log('File received:', file.name);
      // Convert Blob to Buffer
      const buffer = Buffer.from(await file.arrayBuffer());
      console.log('Buffer created:', buffer.length);
      // Upload the file to AssemblyAI
      const uploadUrl = await assemblyClient.files.upload(buffer);
      console.log('File uploaded to:', uploadUrl);
      
      // Prepare transcription parameters; add summarization if enabled
      const transcriptionParams: any = {
        audio_url: uploadUrl,
        language_code: "nl",
        speech_model: "best"
      };

      
      
      const transcriptJob = await assemblyClient.transcripts.create(transcriptionParams);
      console.log('Transcription job created:', transcriptJob.id);
      
      // Poll until the transcription is complete or an error occurs
      let polling = await assemblyClient.transcripts.get(transcriptJob.id);
      while (polling.status !== 'completed' && polling.status !== 'error') {
        await new Promise((res) => setTimeout(res, 3000));
        polling = await assemblyClient.transcripts.get(transcriptJob.id);
      }
      
      if (polling.status === 'error') {
        return NextResponse.json({ error: polling.error }, { status: 500 });
      }
      
      return NextResponse.json({
        text: polling.text,
        summary: polling.summary || null,
      });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
