import { staticFile } from "remotion";

// Load fonts for Remotion compositions
// Using system-safe fonts that don't require external loading
export const FONT_BOLD = "Arial Black, Arial, sans-serif";
export const FONT_REGULAR = "Arial, Helvetica, sans-serif";

// For future: load custom fonts via staticFile
// export const loadCustomFont = () => {
//   const font = new FontFace("CustomFont", `url(${staticFile("fonts/custom.woff2")})`);
//   return font.load();
// };
