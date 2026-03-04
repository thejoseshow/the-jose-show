import { supabase } from "./supabase";
import { HASHTAG_SETS } from "./constants";
import type { Platform, ContentTemplate } from "./types";

// ============================================================
// Supabase-backed template queries
// ============================================================

/**
 * Get all active templates.
 */
export async function getActiveTemplates(): Promise<ContentTemplate[]> {
  const { data, error } = await supabase
    .from("content_templates")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("[templates:getActive]", error.message);
    return [];
  }
  return data as ContentTemplate[];
}

/**
 * Get a template by slug.
 */
export async function getTemplateBySlug(slug: string): Promise<ContentTemplate | null> {
  const { data, error } = await supabase
    .from("content_templates")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) return null;
  return data as ContentTemplate;
}

/**
 * Get a template by ID.
 */
export async function getTemplateById(id: string): Promise<ContentTemplate | null> {
  const { data, error } = await supabase
    .from("content_templates")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as ContentTemplate;
}

/**
 * Suggest which templates should have content this week.
 * Returns active, recurring templates whose frequency matches this week.
 */
export async function getWeeklyScheduleSuggestions(): Promise<ContentTemplate[]> {
  const weekOfMonth = Math.ceil(new Date().getDate() / 7);

  const { data, error } = await supabase
    .from("content_templates")
    .select("*")
    .eq("is_active", true)
    .eq("is_recurring", true);

  if (error || !data) return [];

  return (data as ContentTemplate[]).filter((t) => {
    if (t.frequency === "weekly") return true;
    if (t.frequency === "biweekly") return weekOfMonth % 2 === 1;
    if (t.frequency === "monthly") return weekOfMonth === 1;
    return false;
  });
}

// ============================================================
// Seed data (used by /api/admin/seed-templates)
// ============================================================

interface SeedTemplate {
  slug: string;
  name: string;
  description: string;
  prefix: string;
  default_platforms: Platform[];
  hashtags: string[];
  prompt_hint: string;
  is_recurring: boolean;
  frequency: "weekly" | "biweekly" | "monthly" | null;
  preferred_day: number | null;
}

export const SEED_TEMPLATES: SeedTemplate[] = [
  {
    slug: "bachata-tip",
    name: "Bachata Tip of the Week",
    description: "Weekly bachata dance tip - Dominican style technique, musicality, or styling",
    prefix: "Bachata Tip of the Week",
    default_platforms: ["youtube", "instagram", "tiktok"],
    hashtags: [...HASHTAG_SETS.bachata, ...HASHTAG_SETS.general],
    prompt_hint: "Focus on a specific bachata technique, footwork pattern, or musicality tip. Keep it educational but fun. Show Dominican style authenticity.",
    is_recurring: true,
    frequency: "weekly",
    preferred_day: 2, // Tuesday
  },
  {
    slug: "dr-hidden-gem",
    name: "DR Hidden Gem",
    description: "Showcase a lesser-known place, food, or experience in the Dominican Republic",
    prefix: "DR Hidden Gem",
    default_platforms: ["youtube", "instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.drTour, ...HASHTAG_SETS.culture, ...HASHTAG_SETS.general],
    prompt_hint: "Highlight a hidden gem in the Dominican Republic - a beach, restaurant, neighborhood, or cultural experience most tourists miss. Make viewers want to visit.",
    is_recurring: true,
    frequency: "weekly",
    preferred_day: 4, // Thursday
  },
  {
    slug: "dj-set-highlight",
    name: "DJ Set Highlight",
    description: "Best moment from a recent DJ set or event hosting gig",
    prefix: "DJ Set Highlight",
    default_platforms: ["instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.events, ...HASHTAG_SETS.general],
    prompt_hint: "Capture the energy of a live DJ moment - crowd reaction, track drop, or hosting highlight. Make it feel like you're there.",
    is_recurring: false,
    frequency: null,
    preferred_day: null,
  },
  {
    slug: "dominican-culture-101",
    name: "Dominican Culture 101",
    description: "Explain a Dominican tradition, saying, food, or cultural element",
    prefix: "Dominican Culture 101",
    default_platforms: ["youtube", "instagram", "tiktok"],
    hashtags: [...HASHTAG_SETS.culture, ...HASHTAG_SETS.general],
    prompt_hint: "Teach something about Dominican culture in a fun, engaging way. Could be a saying, tradition, food recipe, or cultural practice. Be proud and educational.",
    is_recurring: true,
    frequency: "biweekly",
    preferred_day: 1, // Monday
  },
  {
    slug: "soflo-vibes",
    name: "SoFlo Vibes",
    description: "South Florida lifestyle content - events, food, spots, nightlife",
    prefix: "SoFlo Vibes",
    default_platforms: ["instagram", "tiktok", "facebook"],
    hashtags: ["#southflorida", "#soflo", "#miami", "#fortlauderdale", "#floridaLife", ...HASHTAG_SETS.general],
    prompt_hint: "Showcase the South Florida lifestyle - a great restaurant, beach spot, event, or nightlife moment. Capture the energy and diversity.",
    is_recurring: false,
    frequency: null,
    preferred_day: null,
  },
  {
    slug: "event-recap",
    name: "Event Recap",
    description: "Post-event highlight reel with best moments",
    prefix: "Event Recap",
    default_platforms: ["youtube", "instagram", "tiktok", "facebook"],
    hashtags: [...HASHTAG_SETS.events, ...HASHTAG_SETS.general],
    prompt_hint: "Create an exciting recap of the event. Highlight the best moments, crowd energy, performances, and special guests. Make people regret missing it and excited for the next one.",
    is_recurring: false,
    frequency: null,
    preferred_day: null,
  },
  {
    slug: "dr-tour-promo",
    name: "DR Tour Promo",
    description: "Promote upcoming DR tour packages with highlights of what's included",
    prefix: "DR Tour with Jose",
    default_platforms: ["youtube", "facebook", "instagram"],
    hashtags: [...HASHTAG_SETS.drTour, ...HASHTAG_SETS.general],
    prompt_hint: "Promote the DR tour experience. Show what participants will see, do, eat, and experience. Build FOMO. Mention it's guided by a local Dominican who knows the real spots.",
    is_recurring: false,
    frequency: null,
    preferred_day: null,
  },
];
