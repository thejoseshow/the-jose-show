import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { writeFile, unlink, mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Point fluent-ffmpeg to the static binary
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface ClipOptions {
  startTime: number;
  endTime: number;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  srtContent?: string; // SRT captions to burn in
  maxDuration?: number; // Cap duration (seconds)
}

export interface ClipResult {
  buffer: Buffer;
  duration: number;
  aspectRatio: "9:16" | "16:9" | "1:1";
}

/**
 * Extract a clip from a video, convert to target aspect ratio,
 * and optionally burn in captions.
 */
export async function extractClip(
  videoBuffer: Buffer,
  inputFilename: string,
  options: ClipOptions
): Promise<ClipResult> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tjs-"));
  const inputPath = join(tmpDir, inputFilename);
  const outputPath = join(tmpDir, "output.mp4");
  const srtPath = options.srtContent ? join(tmpDir, "captions.srt") : null;

  try {
    // Write input files to temp dir
    await writeFile(inputPath, videoBuffer);
    if (srtPath && options.srtContent) {
      await writeFile(srtPath, options.srtContent);
    }

    const { startTime, endTime, aspectRatio = "9:16" } = options;
    const duration = Math.min(
      endTime - startTime,
      options.maxDuration || Infinity
    );

    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .outputOptions([
          "-c:v", "libx264",
          "-preset", "fast",
          "-crf", "23",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
        ]);

      // Build video filter chain
      const filters: string[] = [];

      // Aspect ratio conversion
      if (aspectRatio === "9:16") {
        // Vertical: crop center to 9:16, then scale to 1080x1920
        filters.push("crop=ih*9/16:ih");
        filters.push("scale=1080:1920");
      } else if (aspectRatio === "1:1") {
        // Square: crop center to 1:1, then scale to 1080x1080
        filters.push("crop=min(iw\\,ih):min(iw\\,ih)");
        filters.push("scale=1080:1080");
      } else {
        // 16:9: scale to 1920x1080
        filters.push("scale=1920:1080:force_original_aspect_ratio=decrease");
        filters.push("pad=1920:1080:(ow-iw)/2:(oh-ih)/2");
      }

      // Burn captions if provided
      if (srtPath) {
        // Style: bold white text with dark background, centered at bottom
        const subtitleStyle =
          "FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,Outline=2,Shadow=1,MarginV=40";
        filters.push(
          `subtitles='${srtPath.replace(/'/g, "\\'")}':force_style='${subtitleStyle}'`
        );
      }

      if (filters.length > 0) {
        cmd = cmd.videoFilters(filters);
      }

      cmd
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(new Error(`FFmpeg error: ${err.message}`)))
        .run();
    });

    const outputBuffer = await readFile(outputPath);

    return {
      buffer: outputBuffer,
      duration,
      aspectRatio,
    };
  } finally {
    // Clean up temp files
    await cleanup(inputPath, outputPath, srtPath);
  }
}

/**
 * Convert a full video to vertical format (9:16) for short-form platforms.
 * Used when the full video IS the clip (under 60s).
 */
export async function convertToVertical(
  videoBuffer: Buffer,
  inputFilename: string
): Promise<Buffer> {
  const result = await extractClip(videoBuffer, inputFilename, {
    startTime: 0,
    endTime: Infinity, // Will use full video duration
    aspectRatio: "9:16",
  });
  return result.buffer;
}

/**
 * Get video duration and metadata using ffprobe.
 */
export async function getVideoDuration(
  videoBuffer: Buffer,
  filename: string
): Promise<number> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tjs-probe-"));
  const inputPath = join(tmpDir, filename);

  try {
    await writeFile(inputPath, videoBuffer);

    return new Promise<number>((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) return reject(err);
        resolve(metadata.format.duration || 0);
      });
    });
  } finally {
    await unlink(inputPath).catch(() => {});
  }
}

/**
 * Extract a single frame as a thumbnail.
 */
export async function extractThumbnail(
  videoBuffer: Buffer,
  inputFilename: string,
  timeSeconds: number = 1
): Promise<Buffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tjs-thumb-"));
  const inputPath = join(tmpDir, inputFilename);
  const outputPath = join(tmpDir, "thumb.png");

  try {
    await writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(timeSeconds)
        .outputOptions(["-frames:v", "1", "-q:v", "2"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await cleanup(inputPath, outputPath);
  }
}

/**
 * Extract audio from video as compressed mp3 (for Whisper API 25MB limit).
 */
export async function extractAudio(
  videoBuffer: Buffer,
  inputFilename: string
): Promise<Buffer> {
  const tmpDir = await mkdtemp(join(tmpdir(), "tjs-audio-"));
  const inputPath = join(tmpDir, inputFilename);
  const outputPath = join(tmpDir, "audio.mp3");

  try {
    await writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec("libmp3lame")
        .audioBitrate("64k")
        .audioChannels(1)
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await cleanup(inputPath, outputPath);
  }
}

async function cleanup(...paths: (string | null)[]) {
  for (const p of paths) {
    if (p) await unlink(p).catch(() => {});
  }
}
