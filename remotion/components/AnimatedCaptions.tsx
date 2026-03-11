import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { BRAND_ACCENT, DR_RED } from "../lib/constants";
import { FONT_BOLD } from "../lib/fonts";
import type { CaptionWord, CaptionStyle } from "../lib/types";

// Show a sliding window of words around the current frame
const WORDS_VISIBLE = 6;

export const AnimatedCaptions: React.FC<{
  words: CaptionWord[];
  style: CaptionStyle;
  fontSize?: number;
}> = ({ words, style, fontSize = 56 }) => {
  const frame = useCurrentFrame();

  // Find the current word index
  const currentIndex = words.findIndex(
    (w) => frame >= w.startFrame && frame <= w.endFrame
  );
  if (currentIndex === -1) return null;

  // Window of visible words centered on current
  const startIdx = Math.max(0, currentIndex - Math.floor(WORDS_VISIBLE / 2));
  const endIdx = Math.min(words.length, startIdx + WORDS_VISIBLE);
  const visibleWords = words.slice(startIdx, endIdx);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 200,
        left: 40,
        right: 40,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {visibleWords.map((word, i) => {
        const globalIdx = startIdx + i;
        const isActive = globalIdx === currentIndex;
        const isPast = globalIdx < currentIndex;

        return (
          <CaptionWordSpan
            key={`${globalIdx}-${word.text}`}
            word={word}
            isActive={isActive}
            isPast={isPast}
            style={style}
            fontSize={fontSize}
            frame={frame}
          />
        );
      })}
    </div>
  );
};

const CaptionWordSpan: React.FC<{
  word: CaptionWord;
  isActive: boolean;
  isPast: boolean;
  style: CaptionStyle;
  fontSize: number;
  frame: number;
}> = ({ word, isActive, isPast, style: captionStyle, fontSize, frame }) => {
  // Default style: fade in
  if (captionStyle === "default") {
    const opacity = isActive || isPast ? 1 : 0.4;
    const scale = isActive ? 1.1 : 1;
    return (
      <span
        style={{
          fontSize,
          fontFamily: FONT_BOLD,
          fontWeight: 900,
          color: isActive ? "#FFFFFF" : isPast ? "#FFFFFFCC" : "#FFFFFF66",
          opacity,
          transform: `scale(${scale})`,
          transition: "all 0.1s",
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          display: "inline-block",
        }}
      >
        {word.text}
      </span>
    );
  }

  // Highlight style: yellow sweep on active word
  if (captionStyle === "highlight") {
    const progress = isActive
      ? interpolate(frame, [word.startFrame, word.endFrame], [0, 100], {
          extrapolateRight: "clamp",
        })
      : isPast
        ? 100
        : 0;

    return (
      <span
        style={{
          fontSize,
          fontFamily: FONT_BOLD,
          fontWeight: 900,
          background: `linear-gradient(90deg, ${BRAND_ACCENT} ${progress}%, #FFFFFF ${progress}%)`,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          textShadow: "none",
          filter: `drop-shadow(0 2px 4px rgba(0,0,0,0.8))`,
          display: "inline-block",
        }}
      >
        {word.text}
      </span>
    );
  }

  // Karaoke style: color change
  const color = isActive ? BRAND_ACCENT : isPast ? DR_RED : "#FFFFFF88";
  const scale = isActive ? 1.15 : 1;

  return (
    <span
      style={{
        fontSize,
        fontFamily: FONT_BOLD,
        fontWeight: 900,
        color,
        transform: `scale(${scale})`,
        textShadow: isActive
          ? `0 0 20px ${BRAND_ACCENT}60`
          : "0 2px 6px rgba(0,0,0,0.8)",
        display: "inline-block",
      }}
    >
      {word.text}
    </span>
  );
};
