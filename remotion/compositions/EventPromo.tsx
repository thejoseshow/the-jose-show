import React from "react";
import {
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  AbsoluteFill,
  Sequence,
} from "remotion";
import { Logo } from "../components/Logo";
import { AnimatedText } from "../components/AnimatedText";
import { CountdownNumber } from "../components/CountdownNumber";
import { BrandFooter } from "../components/BrandFooter";
import {
  BRAND_BG_DARK,
  DR_RED,
  DR_BLUE,
  BRAND_ACCENT,
  FPS,
} from "../lib/constants";
import { FONT_BOLD, FONT_REGULAR } from "../lib/fonts";
import type { EventPromoProps } from "../lib/types";

export const EventPromo: React.FC<EventPromoProps> = ({
  eventName,
  eventDate,
  eventLocation,
  promoType,
  daysUntil,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();

  // Background animation
  const bgRotation = interpolate(frame, [0, durationInFrames], [0, 360]);
  const bgScale = interpolate(frame, [0, durationInFrames], [1, 1.3]);

  // Exit fade
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 15, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp" }
  );

  const isCountdown = promoType === "countdown" || promoType === "reminder";

  return (
    <AbsoluteFill
      style={{
        background: BRAND_BG_DARK,
        overflow: "hidden",
        opacity: exitOpacity,
      }}
    >
      {/* Animated gradient background */}
      <div
        style={{
          position: "absolute",
          inset: -200,
          background: `conic-gradient(from ${bgRotation}deg at 50% 50%, ${DR_RED}20, ${DR_BLUE}20, transparent, ${DR_RED}20)`,
          transform: `scale(${bgScale})`,
        }}
      />

      {/* Red accent stripes */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: DR_RED,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 6,
          background: DR_RED,
        }}
      />

      {/* Content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 60,
          gap: 32,
        }}
      >
        {/* Logo */}
        <Sequence from={0} durationInFrames={durationInFrames}>
          <Logo size={100} variant="white" />
        </Sequence>

        {/* Promo type label */}
        <Sequence from={10} durationInFrames={durationInFrames - 10}>
          <PromoLabel type={promoType} />
        </Sequence>

        {/* Countdown number (if countdown/reminder) */}
        {isCountdown && daysUntil > 0 && (
          <Sequence from={20} durationInFrames={durationInFrames - 20}>
            <CountdownNumber number={daysUntil} />
          </Sequence>
        )}

        {/* Event name */}
        <Sequence
          from={isCountdown ? 35 : 20}
          durationInFrames={durationInFrames}
        >
          <AnimatedText
            text={eventName}
            fontSize={52}
            bold
            maxWidth={width - 120}
          />
        </Sequence>

        {/* Date */}
        <Sequence
          from={isCountdown ? 45 : 30}
          durationInFrames={durationInFrames}
        >
          <AnimatedText
            text={eventDate}
            fontSize={30}
            color={BRAND_ACCENT}
          />
        </Sequence>

        {/* Location */}
        {eventLocation && (
          <Sequence
            from={isCountdown ? 55 : 40}
            durationInFrames={durationInFrames}
          >
            <AnimatedText
              text={`📍 ${eventLocation}`}
              fontSize={26}
              color="#FFFFFFAA"
            />
          </Sequence>
        )}
      </div>

      {/* Brand footer */}
      <Sequence from={60} durationInFrames={durationInFrames - 60}>
        <BrandFooter />
      </Sequence>
    </AbsoluteFill>
  );
};

const PromoLabel: React.FC<{ type: EventPromoProps["promoType"] }> = ({
  type,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 200 },
  });

  const labels: Record<EventPromoProps["promoType"], string> = {
    announcement: "NEW EVENT",
    countdown: "COMING SOON",
    reminder: "TOMORROW",
    recap: "LAST NIGHT",
  };

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        background: `${DR_RED}CC`,
        padding: "8px 24px",
        borderRadius: 8,
        fontSize: 18,
        fontFamily: FONT_BOLD,
        color: "#FFFFFF",
        letterSpacing: 4,
        textTransform: "uppercase",
      }}
    >
      {labels[type]}
    </div>
  );
};
