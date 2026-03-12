import OpenAI from "openai";
import { extractAudio } from "./ffmpeg";
import type { TranscriptSegment } from "./types";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25MB

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  language: string;
  duration: number;
  isSpanish: boolean;
}

/**
 * Transcribe a video/audio file using OpenAI Whisper API.
 * Returns full text, word-level segments, detected language, and duration.
 */
export async function transcribeVideo(
  fileBuffer: Buffer,
  filename: string
): Promise<TranscriptionResult> {
  const openai = getOpenAI();

  // If file exceeds Whisper's 25MB limit, extract compressed audio first
  let uploadBuffer = fileBuffer;
  let uploadFilename = filename;
  if (fileBuffer.length > WHISPER_MAX_BYTES) {
    console.log(`File ${filename} is ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB, extracting audio...`);
    uploadBuffer = await extractAudio(fileBuffer, filename);
    uploadFilename = "audio.mp3";
    console.log(`Compressed audio: ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
  }

  // Whisper API accepts file uploads - create a File-like object
  const file = new File([new Uint8Array(uploadBuffer)], uploadFilename, {
    type: getMimeType(uploadFilename),
  });

  const response = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  // Extract segments with timestamps
  const segments: TranscriptSegment[] = (
    (response as unknown as { segments?: Array<{ start: number; end: number; text: string }> })
      .segments || []
  ).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  const detectedLang =
    (response as unknown as { language?: string }).language || "en";

  return {
    text: response.text,
    segments,
    language: detectedLang,
    duration:
      (response as unknown as { duration?: number }).duration ||
      (segments.length > 0 ? segments[segments.length - 1].end : 0),
    isSpanish: detectedLang === "es" || detectedLang === "spanish",
  };
}

/**
 * Generate SRT subtitle content from transcript segments.
 */
export function generateSRT(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const startTime = formatSRTTime(seg.start);
      const endTime = formatSRTTime(seg.end);
      return `${i + 1}\n${startTime} --> ${endTime}\n${seg.text}\n`;
    })
    .join("\n");
}

/**
 * Get segments within a time range (for clip-specific captions).
 */
export function getSegmentsInRange(
  segments: TranscriptSegment[],
  startTime: number,
  endTime: number
): TranscriptSegment[] {
  return segments
    .filter((seg) => seg.end > startTime && seg.start < endTime)
    .map((seg) => ({
      start: Math.max(0, seg.start - startTime),
      end: Math.min(endTime - startTime, seg.end - startTime),
      text: seg.text,
    }));
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n: number, len = 2): string {
  return n.toString().padStart(len, "0");
}

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    webm: "video/webm",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
  };
  return types[ext || ""] || "video/mp4";
}
