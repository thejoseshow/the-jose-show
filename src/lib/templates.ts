import { HASHTAG_SETS, BRAND_VOICE } from "./constants";
import type { Platform } from "./types";

export interface ContentTemplate {
  id: string;
  name: string;
  description: string;
  prefix: string;
  defaultPlatforms: Platform[];
  hashtags: string[];
  promptHint: string; // Extra context for Claude when generating copy
  recurring?: {
    frequency: "weekly" | "biweekly" | "monthly";
    preferredDay?: number; // 0=Sun, 1=Mon, etc.
  };
}

export const CONTENT_TEMPLATES: ContentTemplate[] = [
  {
    id: "bachata-tip",
    name: "Bachata Tip of the Week",
    description: "Weekly bachata dance tip - Dominican style technique, musicality, or styling",
    prefix: "Bachata Tip of the Week",
    defaultPlatforms: ["youtube", "instagram", "tiktok"],
    hashtags: [...HASHTAG_SETS.bachata, ...HASHTAG_SETS.general],
    promptHint: "Focus on a specific bachata technique, footwork pattern, or musicality tip. Keep it educational but fun. Show Dominican style authenticity.",
    recurring: { frequency: "weekly", preferredDay: 2 }, // Tuesday
  },
  {
    id: "dr-hidden-gem",
    name: "DR Hidden Gem",
    description: "Showcase a lesser-known place, food, or experience in the Dominican Republic",
    prefix: "DR Hidden Gem",
    defaultPlatforms: ["youtube", "instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.drTour, ...HASHTAG_SETS.culture, ...HASHTAG_SETS.general],
    promptHint: "Highlight a hidden gem in the Dominican Republic - a beach, restaurant, neighborhood, or cultural experience most tourists miss. Make viewers want to visit.",
    recurring: { frequency: "weekly", preferredDay: 4 }, // Thursday
  },
  {
    id: "dj-set-highlight",
    name: "DJ Set Highlight",
    description: "Best moment from a recent DJ set or event hosting gig",
    prefix: "DJ Set Highlight",
    defaultPlatforms: ["instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.events, ...HASHTAG_SETS.general],
    promptHint: "Capture the energy of a live DJ moment - crowd reaction, track drop, or hosting highlight. Make it feel like you're there.",
  },
  {
    id: "dominican-culture-101",
    name: "Dominican Culture 101",
    description: "Explain a Dominican tradition, saying, food, or cultural element",
    prefix: "Dominican Culture 101",
    defaultPlatforms: ["youtube", "instagram", "tiktok"],
    hashtags: [...HASHTAG_SETS.culture, ...HASHTAG_SETS.general],
    promptHint: "Teach something about Dominican culture in a fun, engaging way. Could be a saying, tradition, food recipe, or cultural practice. Be proud and educational.",
    recurring: { frequency: "biweekly", preferredDay: 1 }, // Monday
  },
  {
    id: "soflo-vibes",
    name: "SoFlo Vibes",
    description: "South Florida lifestyle content - events, food, spots, nightlife",
    prefix: "SoFlo Vibes",
    defaultPlatforms: ["instagram", "tiktok", "facebook"],
    hashtags: ["#southflorida", "#soflo", "#miami", "#fortlauderdale", "#floridaLife", ...HASHTAG_SETS.general],
    promptHint: "Showcase the South Florida lifestyle - a great restaurant, beach spot, event, or nightlife moment. Capture the energy and diversity.",
  },
  {
    id: "event-recap",
    name: "Event Recap",
    description: "Post-event highlight reel with best moments",
    prefix: "Event Recap",
    defaultPlatforms: ["youtube", "instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.events, ...HASHTAG_SETS.general],
    promptHint: "Create an exciting recap of the event. Highlight the best moments, crowd energy, performances, and special guests. Make people regret missing it and excited for the next one.",
  },
  {
    id: "dr-tour-promo",
    name: "DR Tour Promo",
    description: "Promote upcoming DR tour packages with highlights of what's included",
    prefix: "DR Tour with Jose",
    defaultPlatforms: ["youtube", "facebook", "instagram"],
    hashtags: [...HASHTAG_SETS.drTour, ...HASHTAG_SETS.general],
    promptHint: "Promote the DR tour experience. Show what participants will see, do, eat, and experience. Build FOMO. Mention it's guided by a local Dominican who knows the real spots.",
  },
];

/**
 * Get template by ID.
 */
export function getTemplate(id: string): ContentTemplate | undefined {
  return CONTENT_TEMPLATES.find((t) => t.id === id);
}

/**
 * Get templates with weekly recurring schedules.
 */
export function getRecurringTemplates(): ContentTemplate[] {
  return CONTENT_TEMPLATES.filter((t) => t.recurring);
}

/**
 * Suggest which templates should have content this week.
 */
export function getWeeklyScheduleSuggestions(): ContentTemplate[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const weekOfMonth = Math.ceil(today.getDate() / 7);

  return CONTENT_TEMPLATES.filter((t) => {
    if (!t.recurring) return false;
    if (t.recurring.frequency === "weekly") return true;
    if (t.recurring.frequency === "biweekly") return weekOfMonth % 2 === 1;
    if (t.recurring.frequency === "monthly") return weekOfMonth === 1;
    return false;
  });
}
