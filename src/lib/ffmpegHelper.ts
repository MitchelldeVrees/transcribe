// lib/ffmpegHelper.ts
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

let ffmpeg: FFmpeg;
let loaded = false;

/**
 * Laadt FFmpeg.wasm één keer.
 */
export async function loadFFmpeg() {
  if (loaded) return;
  ffmpeg = new FFmpeg();

  // optioneel: forward logs naar een callback
  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.js`,
      "text/javascript"
    ),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      "application/wasm"
    ),
  });

  loaded = true;
}

/**
 * Split een audio File in segmenten van max segmentSec seconden.
 * Retourneert een array met File-objects (.wav).
 */
export async function splitAudioFile(
  file: File,
  segmentSec = 20 * 60 // 20 minuten
): Promise<File[]> {
  if (!loaded) {
    await loadFFmpeg();
  }

  // schrijf de input
  await ffmpeg.writeFile("input", await fetchFile(file));

  // voer segmentatie uit
    await ffmpeg.exec([
      "-i", "input",
      "-vn",                    // geen video
      "-map", "0:a",            // alleen de audiostream
      "-f", "segment",
      "-segment_time", String(segmentSec),
      "-reset_timestamps", "1",
      "-c:a", "copy",           // copy de MP3 data
      "chunk_%03d.mp3"
  ]);

  // lijst en lees de chunks uit
  const allFiles = await ffmpeg.listDir("/");
  const chunkFiles = allFiles.filter((f) =>
    f.name.startsWith("chunk_") && f.name.endsWith(".mp3")
  );

  const chunks: File[] = await Promise.all(
    chunkFiles.map(async (name) => {
      const data = (await ffmpeg.readFile(name.name, "binary")) as Uint8Array;
      return new File(
        [ data ],            // Uint8Array is allowed directly
        name.name,
        { type: "audio/mpeg" }
      );      
    })
  );

  return chunks;
}
