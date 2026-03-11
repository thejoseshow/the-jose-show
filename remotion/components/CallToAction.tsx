import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BRAND_ACCENT, DR_RED } from "../lib/constants";
import { FONT_BOLD } from "../lib/fonts";

export const CallToAction: React.FC<{
  text?: string;
  delay?: number;
}> = ({ text = "SUBSCRIBE", delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  const scaleX = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 12, stiffness: 150 },
  });

  const opacity = interpolate(adjustedFrame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `scaleX(${scaleX})`,
        background: `linear-gradient(135deg, ${DR_RED}, ${BRAND_ACCENT})`,
        padding: "16px 48px",
        borderRadius: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontSize: 28,
          fontFamily: FONT_BOLD,
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: 4,
          textTransform: "uppercase",
        }}
      >
        {text}
      </span>
    </div>
  );
};
