import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import fetch from 'node-fetch';
import pLimit from 'p-limit';

export const runtime = 'nodejs';
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_SECONDS = 10 * 60;
const ffprobe = promisify(ffmpeg.ffprobe);
const limit = pLimit(3);

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
  return files.filter(f => f.startsWith('chunk_')).map(f => path.join(outDir, f));
}

async function transcribeChunk(chunkPath: string): Promise<string> {
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
  if (!res.ok) throw new Error(json.error || 'Transcription error');
  return json.text.trim();
}

async function summarizeTranscript(fullText: string): Promise<{ summary: string; actionItems: string; qna: string }> {
  const prompt = `Hier is een samenvatting van het transcript in drie delen:
1. **Kernpunten** -
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
      messages: [{ role: 'system', content: 'Je bent een transcript-samenvatter.' }, { role: 'user', content: prompt }],
      temperature: 0.5,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Summarization failed');

  // Parse three parts with regex
  const text = json.choices[0].message.content;
  const regex = /1\. \*\*Kernpunten\*\*[\s\S]*?-(?:\s*)([\s\S]*?)2\. \*\*Actiepunten\*\*[\s\S]*?-(?:\s*)([\s\S]*?)3\. \*\*Vragen & Antwoorden\*\*[\s\S]*?-(?:\s*)([\s\S]*)/;
  const match = text.match(regex);
  if (!match) {
    // Fallback: return full summary as 'summary'
    return { summary: text.trim(), actionItems: '', qna: '' };
  }
  return {
    summary: match[1].trim(),
    actionItems: match[2].trim(),
    qna: match[3].trim(),
  };
}

export async function POST(request: Request) {
  const session = uuidv4();
  const tmp = path.join(os.tmpdir(), session);
  const pub = path.join(process.cwd(), 'public', 'chunks', session);
  try {
    const formData = await request.formData();
    const file = formData.get('audioFile') as File;
    if (!file) return NextResponse.json({ error: 'Geen audioFile' }, { status: 400 });

    await fs.mkdir(tmp, { recursive: true });
    const orig = path.join(tmp, file.name);
    await fs.writeFile(orig, Buffer.from(await file.arrayBuffer()));

    const { size } = await fs.stat(orig);
    const chunks = await splitIntoChunks(orig, tmp);
    await fs.mkdir(pub, { recursive: true });
    const publicChunks = chunks.map(p => {
      const dest = path.join(pub, path.basename(p));
      fs.copyFile(p, dest);
      return `${process.env.NEXT_PUBLIC_BASE_URL || ''}/chunks/${session}/${path.basename(p)}`;
    });

    const texts = await Promise.all(chunks.map(cp => limit(() => transcribeChunk(cp))));
    const full = texts.join('\n').trim();
    const enable = formData.get('enableSummarization') === 'true';

    let summary = '', actionItems = '', qna = '';
    if (enable) {
      const parsed = await summarizeTranscript(full);
      summary = parsed.summary;
      actionItems = parsed.actionItems;
      qna = parsed.qna;
    }

    await fs.rm(tmp, { recursive: true, force: true });
    return NextResponse.json({ text: full, summary, actionItems, qna, chunkUrls: publicChunks });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

