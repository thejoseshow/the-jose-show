import OpenAI from "openai";
import { extractAudio, getAudioDuration, extractAudioChunk } from "./ffmpeg";
import type { TranscriptSegment, WordTimestamp } from "./types";

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25MB

let _openai: OpenAI | null = null;
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptSegment[];
  words: WordTimestamp[];
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

  // Extract audio for files that exceed 25MB OR have non-mp4 formats (Whisper only accepts mp3/mp4/etc.)
  let uploadBuffer = fileBuffer;
  let uploadFilename = filename;
  const ext = filename.split(".").pop()?.toLowerCase();
  const whisperNativeFormats = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm", "ogg", "oga", "flac"]);
  const needsAudioExtract = fileBuffer.length > WHISPER_MAX_BYTES || !whisperNativeFormats.has(ext || "");
  if (needsAudioExtract) {
    console.log(`File ${filename} (${ext}, ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB) — extracting audio for Whisper compatibility...`);
    let extracted = false;

    // Try extraction with original filename
    try {
      uploadBuffer = await extractAudio(fileBuffer, filename);
      if (uploadBuffer.length > 1000) {
        uploadFilename = "audio.mp3";
        extracted = true;
        console.log(`Compressed audio: ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
      } else {
        console.warn(`Audio extraction produced empty/tiny output (${uploadBuffer.length} bytes) for ${filename}`);
      }
    } catch (audioErr) {
      console.error(`Audio extraction failed for ${filename}:`, audioErr);
    }

    // Fallback: rename to .mp4 and retry (helps FFmpeg detect container)
    if (!extracted) {
      try {
        const mp4Name = filename.replace(/\.\w+$/, ".mp4");
        console.log(`Retrying audio extraction as ${mp4Name}...`);
        uploadBuffer = await extractAudio(fileBuffer, mp4Name);
        if (uploadBuffer.length > 1000) {
          uploadFilename = "audio.mp3";
          extracted = true;
          console.log(`Fallback audio extraction: ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB`);
        }
      } catch (fallbackErr) {
        console.error(`Fallback audio extraction also failed:`, fallbackErr);
      }
    }

    // Last resort: wrap raw buffer as .mp4 (Whisper accepts mp4 container)
    if (!extracted) {
      console.warn(`All audio extraction failed for ${filename}. Sending raw buffer as .mp4 to Whisper...`);
      uploadFilename = filename.replace(/\.\w+$/, ".mp4");
    }
  }

  // If extracted audio still exceeds 25MB, use chunked transcription
  if (uploadBuffer.length > WHISPER_MAX_BYTES) {
    console.log(`Audio ${(uploadBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds 25MB — using chunked transcription`);
    return transcribeChunked(uploadBuffer);
  }

  // Whisper API accepts file uploads - create a File-like object
  const file = new File([new Uint8Array(uploadBuffer)], uploadFilename, {
    type: getMimeType(uploadFilename),
  });

  let response;
  try {
    response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });
  } catch (whisperErr) {
    // If Whisper rejects the format, return empty transcription instead of crashing the pipeline
    const msg = whisperErr instanceof Error ? whisperErr.message : String(whisperErr);
    if (msg.includes("Invalid file format") || msg.includes("could not be decoded")) {
      console.error(`Whisper rejected ${uploadFilename}: ${msg}. Returning empty transcription.`);
      return {
        text: "",
        segments: [],
        words: [],
        language: "en",
        duration: 0,
        isSpanish: false,
      };
    }
    throw whisperErr;
  }

  // Extract segments with timestamps
  const segments: TranscriptSegment[] = (
    (response as unknown as { segments?: Array<{ start: number; end: number; text: string }> })
      .segments || []
  ).map((seg) => ({
    start: seg.start,
    end: seg.end,
    text: seg.text.trim(),
  }));

  // Extract word-level timestamps
  const words: WordTimestamp[] = (
    (response as unknown as { words?: Array<{ word: string; start: number; end: number }> })
      .words || []
  ).map((w) => ({
    word: w.word.trim(),
    start: w.start,
    end: w.end,
  }));

  const detectedLang =
    (response as unknown as { language?: string }).language || "en";

  return {
    text: response.text,
    segments,
    words,
    language: detectedLang,
    duration:
      (response as unknown as { duration?: number }).duration ||
      (segments.length > 0 ? segments[segments.length - 1].end : 0),
    isSpanish: detectedLang === "es" || detectedLang === "spanish",
  };
}

const CHUNK_DURATION = 600; // 10 minutes per chunk
const CHUNK_OVERLAP = 30;   // 30s overlap for dedup

/**
 * Chunked transcription for audio files > 25MB.
 * Splits into 10-min chunks with 30s overlap, transcribes each, merges results.
 */
async function transcribeChunked(
  audioBuffer: Buffer
): Promise<TranscriptionResult> {
  const openai = getOpenAI();
  const totalDuration = await getAudioDuration(audioBuffer);
  const allSegments: TranscriptSegment[] = [];
  const allWords: WordTimestamp[] = [];
  const textParts: string[] = [];
  let detectedLang = "en";

  let chunkStart = 0;
  let chunkIndex = 0;

  while (chunkStart < totalDuration) {
    const chunkEnd = Math.min(chunkStart + CHUNK_DURATION, totalDuration);
    console.log(`Transcribing chunk ${chunkIndex + 1}: ${chunkStart.toFixed(0)}s–${chunkEnd.toFixed(0)}s`);

    const chunkBuffer = await extractAudioChunk(audioBuffer, chunkStart, chunkEnd);

    const file = new File([new Uint8Array(chunkBuffer)], "chunk.mp3", {
      type: "audio/mpeg",
    });

    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    // Extract segments and offset timestamps
    const chunkSegments: TranscriptSegment[] = (
      (response as unknown as { segments?: Array<{ start: number; end: number; text: string }> })
        .segments || []
    ).map((seg) => ({
      start: seg.start + chunkStart,
      end: seg.end + chunkStart,
      text: seg.text.trim(),
    }));

    const chunkWords: WordTimestamp[] = (
      (response as unknown as { words?: Array<{ word: string; start: number; end: number }> })
        .words || []
    ).map((w) => ({
      word: w.word.trim(),
      start: w.start + chunkStart,
      end: w.end + chunkStart,
    }));

    // Dedup overlap: skip segments/words that fall within the overlap zone of a previous chunk
    if (chunkIndex > 0) {
      const overlapBoundary = chunkStart + CHUNK_OVERLAP;
      const dedupedSegments = chunkSegments.filter((s) => s.start >= overlapBoundary);
      const dedupedWords = chunkWords.filter((w) => w.start >= overlapBoundary);
      allSegments.push(...dedupedSegments);
      allWords.push(...dedupedWords);
      textParts.push(dedupedSegments.map((s) => s.text).join(" "));
    } else {
      allSegments.push(...chunkSegments);
      allWords.push(...chunkWords);
      textParts.push(response.text);
    }

    if (chunkIndex === 0) {
      detectedLang = (response as unknown as { language?: string }).language || "en";
    }

    chunkStart += CHUNK_DURATION - CHUNK_OVERLAP;
    chunkIndex++;
  }

  return {
    text: textParts.join(" "),
    segments: allSegments,
    words: allWords,
    language: detectedLang,
    duration: totalDuration,
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

/**
 * Get words within a time range (for clip-specific word timestamps).
 */
export function getWordsInRange(
  words: WordTimestamp[],
  startTime: number,
  endTime: number
): WordTimestamp[] {
  return words
    .filter((w) => w.end > startTime && w.start < endTime)
    .map((w) => ({
      word: w.word,
      start: Math.max(0, w.start - startTime),
      end: Math.min(endTime - startTime, w.end - startTime),
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
