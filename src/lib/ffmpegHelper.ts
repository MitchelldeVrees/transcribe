// lib/ffmpegHelper.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg;
let loaded = false;

/** Laadt FFmpeg.wasm één keer (browser-fallback only). */
async function loadFFmpeg() {
  if (loaded) return;
  ffmpeg = new FFmpeg();
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

// Mapping extension → MIME (needed for the final File() blobs)
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

// We’ll treat any of these as “containers we can copy” (fast) rather than re-encode.
const supportedExts = new Set(Object.keys(extToMime));

/**
 * Split een audio File op tijds‐duur (niet op byte‐grootte).
 * 
 * - maxDurationSec bepaalt de maximumseconde‐lengte per chunk (default 1500 s).
 * - Als de input‐ext “ondersteund” is, doen we een single-pass ffmpeg copy (zéér snel).
 * - Anders (of in browser) valt het terug op ffmpeg.wasm met re-encode naar MP3 + segment.
 * 
 * Retourneert een array van File-objects, elk ≤ maxDurationSec seconden.
 */
export async function splitAudioFile(
  file: File,
  maxDurationSec = 1500
): Promise<File[]> {
  // Stap 1: bepaal ext en MIME
  const parts = file.name.split(".");
  const origExt = (parts.pop() || "").toLowerCase();
  const mime = extToMime[origExt] || file.type;

  // Stap 2: als “supported” container, probeer native FFmpeg copy (sneller)
  if (supportedExts.has(origExt)) {
    // NOTE: Dit stukje kan in Node.js / server draaien als je ffmpeg op de host hebt.
    // In Next.js kun je die ffmpeg-cli aanroepen in /api/transcribe. Hieronder
    // laten we zien hoe je het CLI-commando zou opbouwen, maar je hoeft dat enkel
    // op de server uit te voeren. In de browser valt dit terug op ffmpeg.wasm.

    // ffmpeg-CLI equivalent:
    // ffmpeg -i input.<origExt>
    //        -f segment -segment_time <maxDurationSec> -c copy
    //        chunk_%03d.<origExt>

    // Check of we ffmpeg-cli op de host kunnen gebruiken (Node.js):
    try {
      // Probeer native ffmpeg via spawn (server‐omgeving)
      // (als je dit in een Edge‐func of Vercel Edge runt, is er géén native ffmpeg
      //  beschikbaar, dus zal dit falen → catch → dan browser‐fallback).
      const { spawnSync } = await import("child_process");
      const tmpInputPath = `/tmp/input.${origExt}`;
      const fs = await import("fs/promises");

      // 1) schrijf bestand naar schijf
      await fs.writeFile(tmpInputPath, new Uint8Array(await file.arrayBuffer()));

      // 2) roep ffmpeg aan om te segmenten
      const args = [
        "-i", tmpInputPath,
        "-f", "segment",
        "-segment_time", String(maxDurationSec),
        "-c", "copy",
        `/tmp/chunk_%03d.${origExt}`,
      ];
      const res = spawnSync("ffmpeg", args);

      if (res.status !== 0) {
        console.warn("Native ffmpeg copy failed, falling back to wasm:", res.stderr.toString());
        throw new Error("Native ffmpeg failed");
      }

      // 3) lees alle gegenereerde chunks in /tmp
      const dirents = await fs.readdir("/tmp", { withFileTypes: true });
      const chunks: File[] = [];
      for (const d of dirents) {
        if (d.isFile() && d.name.match(/^chunk_\d{3}\./)) {
          const data = await fs.readFile(`/tmp/${d.name}`);
          chunks.push(new File([data], d.name, { type: mime }));
        }
      }

      // 4) cleanup (optioneel)
      for (const d of dirents) {
        if (d.name.startsWith("chunk_") || d.name === `input.${origExt}`) {
          await fs.unlink(`/tmp/${d.name}`);
        }
      }

      // Return de gekopieerde chunks
      return chunks;
    } catch (e) {
      // Als native ffmpeg niet bestaat (Edge/Browser), dan naar wasm-fallback hieronder
      console.debug("Falling back to ffmpeg.wasm for splitting:", (e as Error).message);
    }
  }

  // Stap 3: Browser‐fallback of “niet‐ondersteunde” container → gebruik ffmpeg.wasm
  if (!loaded) await loadFFmpeg();

  // Schrijf input.file in de virtuele FFmpeg-FS
  await ffmpeg.writeFile("input", await fetchFile(file));

  // Kies output-extensie (MP3) en stel segment-cmd in
  const outputExt = supportedExts.has(origExt) ? origExt : "mp3";
  const mimeOut = extToMime[outputExt] || `audio/${outputExt}`;

  const ffArgs = [
    "-i", "input",
    "-vn",
    "-map", "0:a",
    "-f", "segment",
    "-segment_time", String(maxDurationSec),
    "-reset_timestamps", "1",
    // Als we in “supported” container blijven, gebruik packet-copy; anders re-encodeer
    ...(supportedExts.has(origExt)
      ? ["-c", "copy"]
      : ["-c:a", "libmp3lame", "-b:a", "128k"]),
    `chunk_%03d.${outputExt}`,
  ];

  await ffmpeg.exec(ffArgs);

  // Lees alle bestanden in de FFmpeg-FS en filter de chunk-bestanden
  const allFiles = await ffmpeg.listDir("/");
  const chunkFiles = allFiles
    .filter((f) => f.name.match(new RegExp(`^chunk_\\d{3}\\.${outputExt}$`)));

  // Zet ze om naar echte File-blobs
  const chunks: File[] = await Promise.all(
    chunkFiles.map(async ({ name }) => {
      const data = (await ffmpeg.readFile(name, "binary")) as Uint8Array;
      return new File([data], name, { type: mimeOut });
    })
  );

  return chunks;
}
