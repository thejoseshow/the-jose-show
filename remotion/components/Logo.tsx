import React from "react";
import {
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  staticFile,
  Img,
} from "remotion";

export const Logo: React.FC<{
  size?: number;
  variant?: "color" | "white";
}> = ({ size = 120, variant = "white" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], {
    extrapolateRight: "clamp",
  });

  const src = variant === "white" ? staticFile("logo-white.png") : staticFile("logo.png");

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Img
        src={src}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
};
