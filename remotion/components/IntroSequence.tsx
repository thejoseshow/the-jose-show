import React from "react";
import {
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Audio,
  staticFile,
} from "remotion";
import { Logo } from "./Logo";
import { BRAND_BG_DARK, DR_RED, DR_BLUE, INTRO_DURATION } from "../lib/constants";
import { FONT_BOLD } from "../lib/fonts";

export const IntroSequence: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background gradient sweep
  const gradientPos = interpolate(frame, [0, INTRO_DURATION], [0, 100], {
    extrapolateRight: "clamp",
  });

  // Logo entrance
  const logoScale = spring({
    frame,
    fps,
    config: { damping: 10, stiffness: 80 },
  });

  // Text reveal
  const textOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  const textSlide = interpolate(frame, [15, 30], [20, 0], {
    extrapolateRight: "clamp",
  });

  // Exit fade
  const exitOpacity = interpolate(
    frame,
    [INTRO_DURATION - 10, INTRO_DURATION],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        width,
        height,
        background: `linear-gradient(${gradientPos * 1.8}deg, ${BRAND_BG_DARK}, ${DR_BLUE}40, ${DR_RED}30)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        opacity: exitOpacity,
      }}
    >
      {/* Red accent line at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: `${gradientPos}%`,
          height: 4,
          background: DR_RED,
        }}
      />

      <div style={{ transform: `scale(${logoScale})` }}>
        <Logo size={160} variant="white" />
      </div>

      <div
        style={{
          opacity: textOpacity,
          transform: `translateY(${textSlide}px)`,
          fontSize: 32,
          fontFamily: FONT_BOLD,
          color: "#FFFFFF",
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        THE JOSE SHOW
      </div>
    </div>
  );
};
