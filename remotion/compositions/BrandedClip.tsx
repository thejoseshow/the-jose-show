import React from "react";
import {
  AbsoluteFill,
  Sequence,
  OffthreadVideo,
  useVideoConfig,
} from "remotion";
import { IntroSequence } from "../components/IntroSequence";
import { OutroSequence } from "../components/OutroSequence";
import { BrandWatermark } from "../components/BrandWatermark";
import { INTRO_DURATION, OUTRO_DURATION } from "../lib/constants";
import type { BrandedClipProps } from "../lib/types";

export const BrandedClip: React.FC<BrandedClipProps> = ({
  clipUrl,
  clipDurationInFrames,
}) => {
  const { width, height } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: "#000" }}>
      {/* Intro: 2 seconds */}
      <Sequence from={0} durationInFrames={INTRO_DURATION}>
        <IntroSequence width={width} height={height} />
      </Sequence>

      {/* Main clip */}
      <Sequence
        from={INTRO_DURATION}
        durationInFrames={clipDurationInFrames}
      >
        <AbsoluteFill>
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
          <BrandWatermark position="bottom-right" size={50} opacity={0.5} />
        </AbsoluteFill>
      </Sequence>

      {/* Outro: 3 seconds */}
      <Sequence
        from={INTRO_DURATION + clipDurationInFrames}
        durationInFrames={OUTRO_DURATION}
      >
        <OutroSequence width={width} height={height} />
      </Sequence>
    </AbsoluteFill>
  );
};
