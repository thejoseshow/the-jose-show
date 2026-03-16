// ============================================================
// The Jose Show - Constants & Brand Voice
// ============================================================

export const SITE_NAME = "The Jose Show";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://thejoseshow.vercel.app";

// Social links
export const SOCIAL_LINKS = {
  facebook: "https://facebook.com/thejoseadelshow",
  instagram: "https://instagram.com/thejoseadelshow",
  tiktok: "https://tiktok.com/@thejoseshow_",
  youtube: "https://youtube.com/@Thejoseshowtv",
} as const;

// Platform-specific limits
export const PLATFORM_LIMITS = {
  youtube: {
    titleMaxLength: 100,
    descriptionMaxLength: 5000,
    maxTags: 30,
    maxFileSize: 128 * 1024 * 1024 * 1024, // 128GB
  },
  facebook: {
    captionMaxLength: 63206,
    maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
  },
  instagram: {
    captionMaxLength: 2200,
    maxHashtags: 30,
    maxFileSize: 3.6 * 1024 * 1024 * 1024, // 3.6GB
    maxDuration: 90, // seconds for Reels
  },
  tiktok: {
    captionMaxLength: 2200,
    maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
    maxDuration: 180, // seconds
  },
} as const;

// Upload limits for Vercel processing (Pro plan: 500MB, 15-min timeout)
export const MAX_VIDEO_SIZE_MB = 500;
export const MAX_VIDEO_SIZE_BYTES = MAX_VIDEO_SIZE_MB * 1024 * 1024;

// Clip extraction defaults
export const DEFAULT_CLIP_DURATION = { min: 30, max: 90 }; // seconds
export const DEFAULT_ASPECT_RATIO = "9:16" as const;

// Google Drive polling interval (cron)
export const DRIVE_POLL_INTERVAL_MINUTES = 15;

// Brand voice for AI content generation
export const BRAND_VOICE = {
  name: "Jose",
  showName: "The Jose Show",
  bio: "Dominican dancer from the DR who lived in New York and now lives in West Palm Beach, Florida. Hosts the Muevete Brunch (usually the last Sunday of the month). Teaches bachata Dominican style. Also a DJ, event host, and podcaster. Posts daily vlogs and family content too.",
  tone: [
    "Energetic and warm",
    "Proud Dominican",
    "Passionate about bachata and Dominican culture",
    "Fun-loving DJ/host energy",
    "Welcoming and inclusive",
    "Bilingual (English primary, Spanish sprinkled in naturally)",
  ],
  topics: [
    "Dominican Republic culture and traditions",
    "South Florida living and vibes",
    "Bachata dancing (Dominican style specifically)",
    "Footwork practice and improvement",
    "DJ sets and hosting events",
    "Events and nightlife",
    "DR tours and travel tips",
    "Food and music",
    "Family moments and daily vlogs",
    "Muevete Brunch monthly event",
    "Teaching bachata classes",
    "Podcast episodes",
  ],
  contentTypes: [
    "dance_practice: Jose practicing bachata footwork or dancing - title about the DANCING/FOOTWORK, not the song",
    "teaching: Jose teaching bachata moves or techniques",
    "event: Muevete Brunch, DJ gigs, hosting events",
    "vlog: Daily life content, behind the scenes",
    "family: Family moments, personal clips",
    "podcast: Podcast clips, interviews, conversations",
    "dj_set: DJ performance or mixing",
    "travel: DR trips, travel content",
  ],
  doNot: [
    "Use overly formal language",
    "Be negative or controversial",
    "Misrepresent Dominican culture",
    "Use excessive slang that's not authentic",
    "Post without Jose's review/approval",
    "Title dance clips based on song lyrics - title based on what Jose is DOING",
  ],
  spanishPhrases: [
    "Dale!", // Let's go!
    "Wepa!", // Expression of excitement
    "Dímelo!", // Tell me! (greeting)
    "Qué lo qué", // What's up
    "Tamo activo", // We're active/ready
    "De lo mío", // My people/my thing
  ],
  signoffs: [
    "- Jose 🇩🇴",
    "The Jose Show keeps rolling!",
    "Dale que dale! 💃🎵",
  ],
} as const;

// Default hashtag sets by topic
export const HASHTAG_SETS = {
  bachata: [
    "#bachata", "#bachatadominicana", "#bachatadancing",
    "#bachatastyle", "#bachatalovers", "#dominicanstyle",
    "#socialdancing", "#latinDance", "#bachatafootwork",
    "#footwork", "#dancepractice", "#bachataclass",
  ],
  events: [
    "#thejoseshow", "#southflorida", "#soflo",
    "#nightlife", "#events", "#djlife",
    "#hosting", "#entertainment",
  ],
  drTour: [
    "#dominicanrepublic", "#DRtravel", "#santodomingo",
    "#puertoplata", "#dominicana", "#caribbean",
    "#islandlife", "#travelDR",
  ],
  culture: [
    "#dominican", "#dominicanculture", "#latino",
    "#hispanicheritage", "#RD", "#quisqueya",
    "#dominicanfood", "#merengue",
  ],
  general: [
    "#thejoseshow", "#joseshowtv", "#content",
    "#viral", "#fyp", "#foryoupage",
    "#reels", "#shorts",
  ],
} as const;

// Posting schedule defaults (EST)
export const DEFAULT_POST_TIMES = {
  youtube: { hour: 14, minute: 0 },   // 2:00 PM
  facebook: { hour: 11, minute: 0 },  // 11:00 AM
  instagram: { hour: 18, minute: 0 }, // 6:00 PM
  tiktok: { hour: 19, minute: 0 },    // 7:00 PM
} as const;

// Dashboard navigation
export const NAV_ITEMS = [
  { label: "Overview", href: "/dashboard", icon: "home" },
  { label: "Content", href: "/dashboard/content", icon: "film" },
  { label: "Calendar", href: "/dashboard/calendar", icon: "calendar" },
  { label: "Events", href: "/dashboard/events", icon: "sparkles" },
  { label: "Templates", href: "/dashboard/templates", icon: "fileText" },
  { label: "Uploads", href: "/dashboard/uploads", icon: "upload" },
  { label: "Analytics", href: "/dashboard/analytics", icon: "chart" },
  { label: "Settings", href: "/dashboard/settings", icon: "settings" },
] as const;
