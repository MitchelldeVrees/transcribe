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
 * Split een audio File in segmenten van max segmentSec seconden.
 * Retourneert een array met File-objects (.<ext>).
 */
export async function splitAudioFile(
  file: File,
  segmentSec = 20 * 60
): Promise<File[]> {
  if (!loaded) await loadFFmpeg();

  // schrijf het originele bestand in WASM-FS
  await ffmpeg.writeFile("input", await fetchFile(file));

  // bepaal extensie (laat alles na de laatste '.' in de naam)
  const parts = file.name.split(".");
  const origExt = parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  const needsReencode = !supportedExts.has(origExt);

  // kies uitvoer-extensie en build ffmpeg-args
  let outputExt: string;
  let ffArgs: string[];

  if (!needsReencode) {
    // puur container-copy split
    outputExt = origExt;
    console.log(`[FFmpeg] Only splitting (no re-encode) for .${origExt} files`);
    ffArgs = [
      "-i", "input",
      "-vn",
      "-map", "0:a",
      "-f", "segment",
      "-segment_time", String(segmentSec),
      "-reset_timestamps", "1",
      "-c", "copy",
      `chunk_%03d.${outputExt}`
    ];
  } else {
    // fallback: re-encode naar MP3
    outputExt = "mp3";
    console.log("[FFmpeg] Re-encoding to MP3 + splitting");
    ffArgs = [
      "-i", "input",
      "-vn",
      "-map", "0:a",
      "-f", "segment",
      "-segment_time", String(segmentSec),
      "-reset_timestamps", "1",
      "-c:a", "libmp3lame",
      "-b:a", "128k",
      `chunk_%03d.${outputExt}`
    ];
  }

  // voer de segmentatie uit
  await ffmpeg.exec(ffArgs);

  // lees de gegenereerde chunks uit
  const allFiles = await ffmpeg.listDir("/");
  const chunkFiles = allFiles
    .filter(f => f.name.match(new RegExp(`^chunk_\\d{3}\\.${outputExt}$`)));

  // bouw de File-array terug met de juiste MIME
  const chunks: File[] = await Promise.all(
    chunkFiles.map(async ({ name }) => {
      const data = await ffmpeg.readFile(name, "binary") as Uint8Array;
      const mime = extToMime[outputExt] || file.type;
      return new File([data], name, { type: mime });
    })
  );

  return chunks;
}
