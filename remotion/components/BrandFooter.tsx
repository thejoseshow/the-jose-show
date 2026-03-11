import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { SOCIAL_HANDLES, DR_RED } from "../lib/constants";
import { FONT_REGULAR } from "../lib/fonts";

export const BrandFooter: React.FC<{
  delay?: number;
}> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const adjustedFrame = Math.max(0, frame - delay);

  const opacity = interpolate(adjustedFrame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        opacity,
      }}
    >
      <div
        style={{
          width: 200,
          height: 2,
          background: `linear-gradient(90deg, transparent, ${DR_RED}, transparent)`,
        }}
      />
      <div
        style={{
          fontSize: 20,
          fontFamily: FONT_REGULAR,
          color: "#FFFFFF99",
          letterSpacing: 2,
        }}
      >
        {SOCIAL_HANDLES.instagram}
      </div>
    </div>
  );
};
