import React from "react";
import {
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  AbsoluteFill,
} from "remotion";
import { AnimatedText } from "../components/AnimatedText";
import {
  BRAND_BG_DARK,
  DR_RED,
  DR_BLUE,
  BRAND_ACCENT,
} from "../lib/constants";
import { FONT_BOLD } from "../lib/fonts";
import type { EventPromoProps } from "../lib/types";

export const EventPromo: React.FC<EventPromoProps> = ({
  eventName,
  eventDate,
  eventLocation,
  promoType,
  daysUntil,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();

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

      {/* All content in a single flex column — no Sequence wrappers */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
          gap: 48,
        }}
      >
        {/* Promo type label */}
        <PromoLabel type={promoType} />

        {/* Countdown number */}
        {isCountdown && daysUntil > 0 && (
          <CountdownNumber number={daysUntil} delay={10} />
        )}

        {/* Event name */}
        <AnimatedText
          text={eventName}
          delay={isCountdown ? 25 : 10}
          fontSize={58}
          bold
          maxWidth={width - 160}
        />

        {/* Date */}
        <AnimatedText
          text={eventDate}
          delay={isCountdown ? 35 : 20}
          fontSize={34}
          color={BRAND_ACCENT}
          letterSpacing={3}
        />

        {/* Location */}
        {eventLocation && (
          <AnimatedText
            text={`📍 ${eventLocation}`}
            delay={isCountdown ? 45 : 30}
            fontSize={28}
            color="#FFFFFFBB"
            letterSpacing={1}
          />
        )}
      </div>

      {/* Logo text — bottom left */}
      <LogoText />

      {/* Brand footer — bottom center */}
      <BrandHandle />
    </AbsoluteFill>
  );
};

// ---- Sub-components with built-in animation (no Sequence needed) ----

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
        padding: "12px 32px",
        borderRadius: 10,
        fontSize: 20,
        fontFamily: FONT_BOLD,
        color: "#FFFFFF",
        letterSpacing: 6,
        textTransform: "uppercase",
      }}
    >
      {labels[type]}
    </div>
  );
};

const CountdownNumber: React.FC<{
  number: number;
  delay?: number;
}> = ({ number, delay = 0 }) => {
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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity,
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          fontSize: 140,
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
          fontSize: 26,
          fontFamily: FONT_BOLD,
          color: "#FFFFFF",
          letterSpacing: 10,
          textTransform: "uppercase",
        }}
      >
        DAYS
      </div>
    </div>
  );
};

const LogoText: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [50, 60], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 120,
        left: 60,
        opacity,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontFamily: FONT_BOLD,
          fontWeight: 900,
          color: "#FFFFFF",
          letterSpacing: 3,
        }}
      >
        THE JOSE SHOW
      </div>
      <div
        style={{
          width: 60,
          height: 3,
          background: DR_RED,
          borderRadius: 2,
        }}
      />
    </div>
  );
};

const BrandHandle: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [60, 70], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        bottom: 50,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        fontSize: 18,
        fontFamily: FONT_BOLD,
        color: "#FFFFFF66",
        letterSpacing: 2,
      }}
    >
      @thejoseadelshow
    </div>
  );
};
