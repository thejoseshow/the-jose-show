import React from "react";
import { Composition } from "remotion";
import { z } from "zod";
import { EventPromo } from "./compositions/EventPromo";
import { BrandedClip } from "./compositions/BrandedClip";
import { CaptionOverlay } from "./compositions/CaptionOverlay";
import {
  FPS,
  VERTICAL,
  EVENT_PROMO_DURATION,
  INTRO_DURATION,
  OUTRO_DURATION,
} from "./lib/constants";

const eventPromoSchema = z.object({
  eventName: z.string(),
  eventDate: z.string(),
  eventLocation: z.string(),
  eventType: z.string(),
  promoType: z.enum(["announcement", "countdown", "reminder", "recap"]),
  daysUntil: z.number(),
  accentColor: z.string().optional(),
});

const brandedClipSchema = z.object({
  clipUrl: z.string(),
  clipDurationInFrames: z.number(),
  title: z.string(),
  socialHandles: z.object({
    instagram: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    facebook: z.string().optional(),
  }).optional(),
});

const captionWordSchema = z.object({
  text: z.string(),
  startFrame: z.number(),
  endFrame: z.number(),
});

const captionOverlaySchema = z.object({
  clipUrl: z.string(),
  clipDurationInFrames: z.number(),
  words: z.array(captionWordSchema),
  captionStyle: z.enum(["default", "highlight", "karaoke"]),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="EventPromo"
        component={EventPromo as React.FC}
        schema={eventPromoSchema}
        durationInFrames={EVENT_PROMO_DURATION}
        fps={FPS}
        width={VERTICAL.width}
        height={VERTICAL.height}
        defaultProps={{
          eventName: "Bachata Night at Starpoint",
          eventDate: "Saturday, March 21 at 9:00 PM",
          eventLocation: "Starpoint Lounge, Boca Raton",
          eventType: "bachata_class",
          promoType: "countdown",
          daysUntil: 7,
        }}
      />

      <Composition
        id="BrandedClip"
        component={BrandedClip as React.FC}
        schema={brandedClipSchema}
        durationInFrames={INTRO_DURATION + 5 * FPS + OUTRO_DURATION}
        fps={FPS}
        width={VERTICAL.width}
        height={VERTICAL.height}
        defaultProps={{
          clipUrl: "",
          clipDurationInFrames: 5 * FPS,
          title: "Preview Clip",
          socialHandles: {
            instagram: "@thejoseadelshow",
            tiktok: "@thejoseshow_",
            youtube: "@Thejoseshowtv",
          },
        }}
      />

      <Composition
        id="CaptionOverlay"
        component={CaptionOverlay as React.FC}
        schema={captionOverlaySchema}
        durationInFrames={5 * FPS}
        fps={FPS}
        width={VERTICAL.width}
        height={VERTICAL.height}
        defaultProps={{
          clipUrl: "",
          clipDurationInFrames: 5 * FPS,
          words: [
            { text: "Welcome", startFrame: 0, endFrame: 15 },
            { text: "to", startFrame: 15, endFrame: 25 },
            { text: "The", startFrame: 25, endFrame: 40 },
            { text: "Jose", startFrame: 40, endFrame: 60 },
            { text: "Show!", startFrame: 60, endFrame: 90 },
          ],
          captionStyle: "default",
        }}
      />
    </>
  );
};
