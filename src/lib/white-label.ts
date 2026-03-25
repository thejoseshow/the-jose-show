// ============================================================
// White-Label Configuration
// Multi-tenant branding & feature flags
// ============================================================

import { getSupabase } from "./supabase";

export interface WhiteLabelConfig {
  tenant_id: string;
  brand_name: string;
  primary_color: string; // hex color
  secondary_color: string;
  logo_url: string | null;
  favicon_url: string | null;
  custom_domain: string | null;
  features: {
    opus_clip: boolean;
    remotion: boolean;
    ai_copy: boolean;
    events: boolean;
    templates: boolean;
    analytics: boolean;
  };
}

// Default config for The Jose Show
export const DEFAULT_CONFIG: WhiteLabelConfig = {
  tenant_id: "default",
  brand_name: "The Jose Show",
  primary_color: "#f97316", // orange
  secondary_color: "#1e293b",
  logo_url: null,
  favicon_url: null,
  custom_domain: null,
  features: {
    opus_clip: true,
    remotion: true,
    ai_copy: true,
    events: true,
    templates: true,
    analytics: true,
  },
};

/**
 * Fetch white-label config from Supabase, falling back to DEFAULT_CONFIG.
 */
export async function getWhiteLabelConfig(
  tenantId?: string
): Promise<WhiteLabelConfig> {
  if (!tenantId || tenantId === "default") {
    return DEFAULT_CONFIG;
  }

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("white_label_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .single();

    if (error || !data) {
      return DEFAULT_CONFIG;
    }

    return {
      tenant_id: data.tenant_id,
      brand_name: data.brand_name ?? DEFAULT_CONFIG.brand_name,
      primary_color: data.primary_color ?? DEFAULT_CONFIG.primary_color,
      secondary_color: data.secondary_color ?? DEFAULT_CONFIG.secondary_color,
      logo_url: data.logo_url ?? null,
      favicon_url: data.favicon_url ?? null,
      custom_domain: data.custom_domain ?? null,
      features: {
        ...DEFAULT_CONFIG.features,
        ...(typeof data.features === "object" && data.features !== null
          ? data.features
          : {}),
      },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/**
 * Convert a hex color string to oklch CSS value.
 * Uses sRGB -> linear RGB -> XYZ -> oklab -> oklch conversion.
 */
function hexToOklch(hex: string): string {
  // Parse hex
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  // sRGB to linear RGB
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // Linear RGB to XYZ (D65)
  const x = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const y = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const z = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  // XYZ to oklab
  const l_ = Math.cbrt(0.2104542553 * x + 0.7936177850 * y - 0.0040720468 * z);
  const m_ = Math.cbrt(0.0123264800 * x + 0.6338517070 * y + 0.3567653820 * z);
  const s_ = Math.cbrt(-0.0085468900 * x + 0.2289939180 * y + 0.7856303710 * z);

  const okL = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  // oklab to oklch
  const C = Math.sqrt(okA * okA + okB * okB);
  let H = (Math.atan2(okB, okA) * 180) / Math.PI;
  if (H < 0) H += 360;

  return `oklch(${okL.toFixed(3)} ${C.toFixed(3)} ${H.toFixed(1)})`;
}

/**
 * Generate CSS custom properties from white-label brand colors.
 * These can be injected into the document to override the theme.
 */
export function generateCSSVariables(config: WhiteLabelConfig): string {
  const primary = hexToOklch(config.primary_color);
  const secondary = hexToOklch(config.secondary_color);

  return [
    `--wl-primary: ${primary};`,
    `--wl-secondary: ${secondary};`,
    `--wl-primary-hex: ${config.primary_color};`,
    `--wl-secondary-hex: ${config.secondary_color};`,
  ].join("\n");
}
