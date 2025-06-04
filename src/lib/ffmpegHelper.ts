// lib/ffmpegHelper.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg;
let loaded = false;

/** Laadt FFmpeg.wasm één keer. */
export async function loadFFmpeg() {
  if (loaded) return;
  ffmpeg = new FFmpeg();

  // forward logs naar console
  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  loaded = true;
}

// map van extension → MIME voor de File() constructor
const extToMime: Record<string, string> = {
  mp3:  "audio/mpeg",
  m4a:  "audio/mp4",
  mp4:  "audio/mp4",
  wav:  "audio/wav",
  ogg:  "audio/ogg",
  oga:  "audio/ogg",
  flac: "audio/flac",
  webm: "audio/webm",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
};


// Supported container extensions (no re-encode needed)
const supportedExts = new Set(Object.keys(extToMime));

/**
 * Split een audio File. Voor ondersteunde containers wordt het bestand
 * simpelweg in stukken van maximaal ~24MB gesliced. Voor andere formaten
 * vallen we terug op ffmpeg.wasm dat naar MP3 encodeert en in segmenten
 * van segmentSec seconden splitst.
 * Retourneert een array met File-objects (.<ext>).
 */
export async function splitAudioFile(
  file: File,
  segmentSec = 20 * 60
): Promise<File[]> {
  const parts = file.name.split('.');
  const origExt = parts.pop()?.toLowerCase() || '';
  const mime = extToMime[origExt] || file.type;

  // Quick path: slice the file if the container is supported
  if (supportedExts.has(origExt)) {
    const maxBytes = 24 * 1024 * 1024; // keep chunks <25MB for OpenAI

    if (file.size <= maxBytes) {
      return [file];
    }

    const chunks: File[] = [];
    for (let start = 0, idx = 0; start < file.size; start += maxBytes, idx++) {
      const slice = file.slice(start, Math.min(start + maxBytes, file.size), mime);
      chunks.push(
        new File([slice], `chunk_${idx.toString().padStart(3, '0')}.${origExt}`, {
          type: mime,
        })
      );
    }
    return chunks;
  }

  // Fallback: use ffmpeg.wasm to re-encode and split
  if (!loaded) await loadFFmpeg();
  await ffmpeg.writeFile('input', await fetchFile(file));

  const outputExt = 'mp3';
  const ffArgs = [
    '-i', 'input',
    '-vn',
    '-map', '0:a',
    '-f', 'segment',
    '-segment_time', String(segmentSec),
    '-reset_timestamps', '1',
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    `chunk_%03d.${outputExt}`,
  ];

  await ffmpeg.exec(ffArgs);

  const allFiles = await ffmpeg.listDir('/');
  const chunkFiles = allFiles.filter((f) =>
    f.name.match(new RegExp(`^chunk_\\d{3}\\.${outputExt}$`))
  );

  const chunks: File[] = await Promise.all(
    chunkFiles.map(async ({ name }) => {
      const data = (await ffmpeg.readFile(name, 'binary')) as Uint8Array;
      return new File([data], name, { type: extToMime[outputExt] });
    })
  );

  return chunks;
}
