import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const extToMime: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mpeg: 'audio/mpeg',
  mpga: 'audio/mpeg',
}

const supportedExts = new Set(Object.keys(extToMime))

function getExt(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

/**
 * Split an audio File server-side using ffmpeg.
 */
export async function splitAudioServer(file: File, segmentSec = 20 * 60): Promise<File[]> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static binary not found')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const tempDir = join(tmpdir(), `split-${crypto.randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })

  const ext = getExt(file.name) || 'mp3'
  const needsReencode = !supportedExts.has(ext)
  const inputPath = join(tempDir, `input.${ext}`)
  await fs.writeFile(inputPath, buffer)

  const outputExt = needsReencode ? 'mp3' : ext
  const outputPattern = join(tempDir, `chunk_%03d.${outputExt}`)

  const args = [
    '-i', inputPath,
    '-vn',
    '-map', '0:a',
    '-f', 'segment',
    '-segment_time', String(segmentSec),
    '-reset_timestamps', '1',
  ]

  if (needsReencode) {
    args.push('-c:a', 'libmp3lame', '-b:a', '128k')
  } else {
    args.push('-c', 'copy')
  }
  args.push(outputPattern)

  await new Promise<void>((resolve, reject) => {
    execFile(ffmpegPath as string, args, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })

  const files = await fs.readdir(tempDir)
  const chunks = [] as File[]
  for (const name of files) {
    if (!name.startsWith('chunk_')) continue
    const data = await fs.readFile(join(tempDir, name))
    const mime = extToMime[outputExt] || file.type
    chunks.push(new File([data], name, { type: mime }))
  }

  await fs.rm(tempDir, { recursive: true, force: true })
  return chunks
}
