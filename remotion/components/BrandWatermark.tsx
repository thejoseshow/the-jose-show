import React from "react";
import { staticFile, Img } from "remotion";

export const BrandWatermark: React.FC<{
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  size?: number;
  opacity?: number;
}> = ({ position = "bottom-right", size = 60, opacity = 0.6 }) => {
  const positionStyles: React.CSSProperties = {
    "top-left": { top: 40, left: 40 },
    "top-right": { top: 40, right: 40 },
    "bottom-left": { bottom: 40, left: 40 },
    "bottom-right": { bottom: 40, right: 40 },
  }[position];

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyles,
        opacity,
        width: size,
        height: size,
      }}
    >
      <Img
        src={staticFile("logo-white.png")}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
};
