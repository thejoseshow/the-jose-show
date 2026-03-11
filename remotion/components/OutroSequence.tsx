import React from "react";
import { useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { Logo } from "./Logo";
import { CallToAction } from "./CallToAction";
import { BRAND_BG_DARK, DR_RED, DR_BLUE, SOCIAL_HANDLES, OUTRO_DURATION } from "../lib/constants";
import { FONT_BOLD, FONT_REGULAR } from "../lib/fonts";

export const OutroSequence: React.FC<{
  width: number;
  height: number;
}> = ({ width, height }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance
  const enterOpacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Social handles stagger in
  const handles = [
    { icon: "IG", handle: SOCIAL_HANDLES.instagram },
    { icon: "TT", handle: SOCIAL_HANDLES.tiktok },
    { icon: "YT", handle: SOCIAL_HANDLES.youtube },
  ];

  return (
    <div
      style={{
        width,
        height,
        background: `radial-gradient(ellipse at center, ${DR_BLUE}30, ${BRAND_BG_DARK})`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 40,
        opacity: enterOpacity,
      }}
    >
      <Logo size={100} variant="white" />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
        }}
      >
        {handles.map((h, i) => {
          const handleOpacity = interpolate(
            frame,
            [15 + i * 8, 25 + i * 8],
            [0, 1],
            { extrapolateRight: "clamp" }
          );
          const handleSlide = interpolate(
            frame,
            [15 + i * 8, 25 + i * 8],
            [20, 0],
            { extrapolateRight: "clamp" }
          );

          return (
            <div
              key={h.icon}
              style={{
                opacity: handleOpacity,
                transform: `translateY(${handleSlide}px)`,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: `${DR_RED}80`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontFamily: FONT_BOLD,
                  color: "#FFF",
                }}
              >
                {h.icon}
              </div>
              <span
                style={{
                  fontSize: 24,
                  fontFamily: FONT_REGULAR,
                  color: "#FFFFFFCC",
                }}
              >
                {h.handle}
              </span>
            </div>
          );
        })}
      </div>

      <CallToAction delay={40} />
    </div>
  );
};
