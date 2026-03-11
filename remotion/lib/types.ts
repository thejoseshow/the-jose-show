// ============================================================
// Remotion Composition Input Types
// ============================================================

export interface EventPromoProps {
  eventName: string;
  eventDate: string; // formatted display string
  eventLocation: string;
  eventType: string;
  promoType: "announcement" | "countdown" | "reminder" | "recap";
  daysUntil: number;
  accentColor?: string; // hex color override
}

export interface BrandedClipProps {
  clipUrl: string;
  clipDurationInFrames: number;
  title: string;
  socialHandles?: {
    instagram?: string;
    tiktok?: string;
    youtube?: string;
    facebook?: string;
  };
}

export interface CaptionWord {
  text: string;
  startFrame: number;
  endFrame: number;
}

export type CaptionStyle = "default" | "highlight" | "karaoke";

export interface CaptionOverlayProps {
  clipUrl: string;
  clipDurationInFrames: number;
  words: CaptionWord[];
  captionStyle: CaptionStyle;
}
