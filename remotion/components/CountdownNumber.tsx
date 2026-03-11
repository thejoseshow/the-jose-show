import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { BRAND_ACCENT, DR_RED } from "../lib/constants";
import { FONT_BOLD } from "../lib/fonts";

export const CountdownNumber: React.FC<{
  number: number;
  delay?: number;
  label?: string;
}> = ({ number, delay = 0, label = "DAYS" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);

  const scale = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.8 },
  });

  const opacity = interpolate(adjustedFrame, [0, 5], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Pulse effect after landing
  const pulseFrame = Math.max(0, adjustedFrame - 15);
  const pulse = pulseFrame > 0
    ? 1 + Math.sin(pulseFrame * 0.15) * 0.03
    : 1;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity,
        transform: `scale(${scale * pulse})`,
      }}
    >
      <div
        style={{
          fontSize: 160,
          fontFamily: FONT_BOLD,
          fontWeight: 900,
          color: BRAND_ACCENT,
          lineHeight: 1,
          textShadow: `0 0 40px ${DR_RED}80, 0 4px 12px rgba(0,0,0,0.5)`,
        }}
      >
        {number}
      </div>
      <div
        style={{
          fontSize: 28,
          fontFamily: FONT_BOLD,
          color: "#FFFFFF",
          letterSpacing: 8,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
};
