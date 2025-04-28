import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import pLimit from 'p-limit';

// Use Node.js runtime
export const runtime = 'nodejs';

// Limits
const MAX_BYTES = 25 * 1024 * 1024;   // 25 MB per chunk
const MAX_SECONDS = 10 * 60;          // 10 minutes per chunk
const ffprobe = promisify(ffmpeg.ffprobe);
const limit = pLimit(3);

// Split and re-encode into WAV chunks
async function splitIntoChunks(inputPath: string, outDir: string): Promise<string[]> {
  const { size } = await fs.stat(inputPath);
  const meta: any = await ffprobe(inputPath);
  const duration = meta.format.duration;
  const bytesPerSec = size / duration;
  const sizeLimitSec = Math.floor((MAX_BYTES * 0.9) / bytesPerSec);
  const segmentSec = Math.min(MAX_SECONDS, Math.max(1, sizeLimitSec));

  await fs.mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, 'chunk_%03d.wav');
  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-f', 'segment',
        '-segment_time', `${segmentSec}`,
        '-reset_timestamps', '1',
        '-c:a', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
      ])
      .output(pattern)
      .on('end', () => resolve())
      .on('error', reject)
      .run();
  });

  const files = await fs.readdir(outDir);
  return files
    .filter(f => f.startsWith('chunk_'))
    .map(f => path.join(outDir, f));
}

// Transcribe a single chunk via OpenAI API
async function transcribeChunk(chunkPath: string): Promise<string> {
  try {
    const buffer = await fs.readFile(chunkPath);
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', buffer, path.basename(chunkPath));
    form.append('model', 'gpt-4o-mini-transcribe');
    form.append('language', 'nl');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form as any,
    });
    const json = await res.json();
    if (!res.ok) throw new Error('Transcription failed');
    return (json.text || '').trim();
  } catch (err) {
    console.error('Transcription error for', chunkPath, err);
    throw new Error('Fout bij transcriberen');
  }
}

// Summarize transcript
async function summarizeTranscript(fullText: string): Promise<{ summary: string; actionItems: string; qna: string }> {
  try {
    const prompt = `Hier is een samenvatting van het transcript in drie delen:
1. **Samenvatting** -
2. **Actiepunten** -
3. **Vragen & Antwoorden** -

Transcript:
${fullText}`;
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Je bent een transcript-samenvatter.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.5,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error('Summarization failed');

    const text = json.choices[0].message.content;
    const regex = /1\. \*\*Samenvatting\*\*[\s\S]*?-(?:\s*)([\s\S]*?)2\. \*\*Actiepunten\*\*[\s\S]*?-(?:\s*)([\s\S]*?)3\. \*\*Vragen & Antwoorden\*\*[\s\S]*?-(?:\s*)([\s\S]*)/;
    const match = text.match(regex);
    if (!match) return { summary: text.trim(), actionItems: '', qna: '' };

    return {
      summary: match[1].trim(),
      actionItems: match[2].trim(),
      qna: match[3].trim(),
    };
  } catch (err) {
    console.error('Summarization error', err);
    throw new Error('Fout bij samenvatten');
  }
}

// POST handler without saving audio files
export async function POST(request: Request) {
  const session = uuidv4();
  const tmpDir = path.join(os.tmpdir(), session);

  try {
    const formData = await request.formData();
    const file = formData.get('audioFile') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'Geen audioFile gevonden' }, { status: 400 });
    }

    // write to temp for splitting
    await fs.mkdir(tmpDir, { recursive: true });
    const origPath = path.join(tmpDir, file.name);
    await fs.writeFile(origPath, Buffer.from(await file.arrayBuffer()));

    // split into chunks
    const chunkFiles = await splitIntoChunks(origPath, tmpDir);

    // transcribe each chunk
    const texts = await Promise.all(chunkFiles.map(cp => limit(() => transcribeChunk(cp))));
    const fullText = texts.join('\n').trim();

    // optional summarization
    let summary = '', actionItems = '', qna = '';
    if (formData.get('enableSummarization') === 'true') {
      const parsed = await summarizeTranscript(fullText);
      summary = parsed.summary;
      actionItems = parsed.actionItems;
      qna = parsed.qna;
    }

    // cleanup temp
    await fs.rm(tmpDir, { recursive: true, force: true });

    // return only transcript and summary parts
    return NextResponse.json({ text: fullText, summary, actionItems, qna });
  } catch (err: any) {
    console.error('Error in POST /api/transcribe', err);
    return NextResponse.json(
      { error: 'Er is een interne fout opgetreden. Probeer het later opnieuw.' },
      { status: 500 }
    );
  }
}


