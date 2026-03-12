import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { FONT_BOLD, FONT_REGULAR } from "../lib/fonts";

export const AnimatedText: React.FC<{
  text: string;
  delay?: number;
  fontSize?: number;
  color?: string;
  bold?: boolean;
  align?: "left" | "center" | "right";
  maxWidth?: number;
  letterSpacing?: number;
}> = ({
  text,
  delay = 0,
  fontSize = 48,
  color = "#FFFFFF",
  bold = false,
  align = "center",
  maxWidth,
  letterSpacing = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const adjustedFrame = Math.max(0, frame - delay);
  const slideUp = spring({
    frame: adjustedFrame,
    fps,
    config: { damping: 15, stiffness: 120 },
  });

  const opacity = interpolate(adjustedFrame, [0, 8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(slideUp, [0, 1], [30, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        fontSize,
        fontFamily: bold ? FONT_BOLD : FONT_REGULAR,
        fontWeight: bold ? 900 : 400,
        color,
        textAlign: align,
        lineHeight: 1.4,
        maxWidth,
        letterSpacing,
        textShadow: "0 2px 8px rgba(0,0,0,0.5)",
      }}
    >
      {text}
    </div>
  );
};
