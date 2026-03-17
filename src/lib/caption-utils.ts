import type { WordTimestamp } from "./types";

export interface CaptionFrame {
  text: string;
  startFrame: number;
  endFrame: number;
}

/**
 * Convert word-level timestamps (seconds) to frame-based caption data.
 */
export function convertWordTimestampsToFrames(
  words: WordTimestamp[],
  fps = 30
): CaptionFrame[] {
  return words.map((w) => ({
    text: w.word,
    startFrame: Math.round(w.start * fps),
    endFrame: Math.round(w.end * fps),
  }));
}

/**
 * Convert transcript segments to word-level frames by splitting proportionally.
 * Fallback for clips without word-level timestamps.
 */
export function convertSegmentsToWords(
  segments: Array<{ start: number; end: number; text: string }>,
  fps = 30
): CaptionFrame[] {
  const words: CaptionFrame[] = [];

  for (const segment of segments) {
    const segmentWords = segment.text.trim().split(/\s+/);
    if (segmentWords.length === 0) continue;

    const segDuration = segment.end - segment.start;
    const wordDuration = segDuration / segmentWords.length;

    for (let i = 0; i < segmentWords.length; i++) {
      const wordStart = segment.start + i * wordDuration;
      const wordEnd = wordStart + wordDuration;
      words.push({
        text: segmentWords[i],
        startFrame: Math.round(wordStart * fps),
        endFrame: Math.round(wordEnd * fps),
      });
    }
  }

  return words;
}

/**
 * Parse an SRT string back to segments for backwards compatibility.
 */
export function parseSRTToSegments(
  srt: string
): Array<{ start: number; end: number; text: string }> {
  const segments: Array<{ start: number; end: number; text: string }> = [];
  const blocks = srt.trim().split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const match = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!match) continue;

    const start =
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseInt(match[3]) +
      parseInt(match[4]) / 1000;
    const end =
      parseInt(match[5]) * 3600 +
      parseInt(match[6]) * 60 +
      parseInt(match[7]) +
      parseInt(match[8]) / 1000;
    const text = lines.slice(2).join(" ").trim();

    segments.push({ start, end, text });
  }

  return segments;
}
