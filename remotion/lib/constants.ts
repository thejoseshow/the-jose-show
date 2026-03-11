// ============================================================
// Remotion Constants - The Jose Show Branding
// ============================================================

export const FPS = 30;

// DR flag colors
export const DR_RED = "#CE1126";
export const DR_BLUE = "#00209F";
export const DR_WHITE = "#FFFFFF";

// Brand palette
export const BRAND_PRIMARY = DR_RED;
export const BRAND_SECONDARY = DR_BLUE;
export const BRAND_ACCENT = "#FFD700"; // Gold accent
export const BRAND_BG_DARK = "#0A0A0A";
export const BRAND_BG_GRADIENT = ["#1A0A2E", "#16213E", "#0F3460"];

// Social handles
export const SOCIAL_HANDLES = {
  instagram: "@thejoseadelshow",
  tiktok: "@thejoseshow_",
  youtube: "@Thejoseshowtv",
  facebook: "The Jose Show",
} as const;

// Composition dimensions
export const VERTICAL = { width: 1080, height: 1920 } as const;
export const HORIZONTAL = { width: 1920, height: 1080 } as const;
export const SQUARE = { width: 1080, height: 1080 } as const;

// Duration defaults (in frames at 30fps)
export const INTRO_DURATION = 2 * FPS; // 2 seconds
export const OUTRO_DURATION = 3 * FPS; // 3 seconds
export const EVENT_PROMO_DURATION = 12 * FPS; // 12 seconds
