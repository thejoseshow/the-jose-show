import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import { AnimatedCaptions } from "../components/AnimatedCaptions";
import { BrandWatermark } from "../components/BrandWatermark";
import type { CaptionOverlayProps } from "../lib/types";

export const CaptionOverlay: React.FC<CaptionOverlayProps> = ({
  clipUrl,
  clipDurationInFrames,
  words,
  captionStyle,
}) => {
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Base video */}
      {clipUrl ? (
        <OffthreadVideo
          src={clipUrl}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#111",
            color: "#666",
            fontSize: 24,
          }}
        >
          Video Preview
        </div>
      )}

      {/* Animated captions overlay */}
      <AnimatedCaptions words={words} style={captionStyle} />

      {/* Watermark */}
      <BrandWatermark position="top-right" size={40} opacity={0.4} />
    </AbsoluteFill>
  );
};
