import Anthropic from "@anthropic-ai/sdk";
import { BRAND_VOICE, HASHTAG_SETS, PLATFORM_LIMITS } from "./constants";
import type { TranscriptSegment, Platform } from "./types";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Use Haiku for fast, cheap content generation (~$0.01 per piece)
const MODEL = "claude-haiku-4-5";

const BRAND_SYSTEM_PROMPT = `You are a social media content writer for "${BRAND_VOICE.showName}" hosted by ${BRAND_VOICE.name}.

BRAND VOICE:
- Tone: ${BRAND_VOICE.tone.join("; ")}
- Topics: ${BRAND_VOICE.topics.join(", ")}
- Naturally mix in Dominican Spanish phrases like: ${BRAND_VOICE.spanishPhrases.join(", ")}
- DO NOT: ${BRAND_VOICE.doNot.join("; ")}

PLATFORMS:
- YouTube (@Thejoseshowtv): Longer videos up to 8 min, entertainment/culture/dance content
- Facebook (thejoseadelshow): Community engagement, event sharing
- Instagram (thejoseadelshow): Reels under 60s, visual storytelling
- TikTok (@thejoseshow_): Short viral clips under 60s, trending sounds/formats

Always write in Jose's authentic voice. Be energetic, warm, and proud of Dominican culture.`;

export interface ClipRecommendation {
  start_time: number;
  end_time: number;
  score: number;
  reasoning: string;
  suggested_title: string;
  platforms: Platform[];
}

/**
 * Analyze a transcript and recommend the best clip moments.
 * Returns ranked clip recommendations with timestamps.
 */
export async function analyzeTranscriptForClips(
  transcript: string,
  segments: TranscriptSegment[],
  videoDuration: number
): Promise<ClipRecommendation[]> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: BRAND_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Analyze this video transcript and find the best moments for short-form clips (30-60 seconds for TikTok/Instagram/Facebook, and the best longer segment up to 8 minutes for YouTube).

VIDEO DURATION: ${videoDuration} seconds

TRANSCRIPT WITH TIMESTAMPS:
${segments.map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`).join("\n")}

Find 3-5 of the most engaging moments. For each, provide:
1. Start and end timestamps (in seconds)
2. A score from 1-10 (10 = most engaging)
3. Why this moment is engaging
4. A catchy title
5. Which platforms it's best for

Respond ONLY with a JSON array. Example:
[{"start_time": 15.0, "end_time": 55.0, "score": 9, "reasoning": "Great energy, funny moment", "suggested_title": "When bachata hits different", "platforms": ["tiktok", "instagram", "facebook"]}]

Prioritize moments with:
- High energy or emotion
- Funny or surprising moments
- Dance highlights
- Cultural insights or stories
- Quotable lines`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "[]";
  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]) as ClipRecommendation[];
  } catch {
    console.error("Failed to parse clip recommendations:", text);
    return [];
  }
}

export interface PlatformCopy {
  youtube_title: string | null;
  youtube_description: string | null;
  youtube_tags: string[];
  facebook_text: string;
  instagram_caption: string;
  tiktok_caption: string;
}

/**
 * Generate platform-specific captions, descriptions, and hashtags.
 * When isSpanish is true, generates bilingual content (primary Spanish, English secondary).
 */
export async function generatePlatformCopy(
  clipTranscript: string,
  suggestedTitle: string,
  platforms: Platform[],
  isSpanish = false
): Promise<PlatformCopy> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: BRAND_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate social media copy for this video clip.

CLIP TRANSCRIPT:
${clipTranscript}

SUGGESTED TITLE: ${suggestedTitle}
TARGET PLATFORMS: ${platforms.join(", ")}
LANGUAGE: ${isSpanish ? "The video is primarily in SPANISH. Write captions in Spanish first, then add an English translation or mix. Make hashtags bilingual." : "The video is primarily in ENGLISH. Sprinkle in Dominican Spanish phrases naturally as Jose would."}

Available hashtag sets:
- Bachata: ${HASHTAG_SETS.bachata.join(" ")}
- Events: ${HASHTAG_SETS.events.join(" ")}
- DR Tour: ${HASHTAG_SETS.drTour.join(" ")}
- Culture: ${HASHTAG_SETS.culture.join(" ")}
- General: ${HASHTAG_SETS.general.join(" ")}

Generate copy for EACH platform. Respond ONLY with JSON:
{
  "youtube_title": "catchy title under ${PLATFORM_LIMITS.youtube.titleMaxLength} chars (null if not targeting YouTube)",
  "youtube_description": "detailed description with timestamps, links to socials (null if not targeting YouTube)",
  "youtube_tags": ["tag1", "tag2", ...up to ${PLATFORM_LIMITS.youtube.maxTags} tags],
  "facebook_text": "engaging post text with emojis and hashtags",
  "instagram_caption": "caption under ${PLATFORM_LIMITS.instagram.captionMaxLength} chars with hashtags (max ${PLATFORM_LIMITS.instagram.maxHashtags})",
  "tiktok_caption": "short punchy caption under ${PLATFORM_LIMITS.tiktok.captionMaxLength} chars with trending hashtags"
}

Make each platform's copy unique - don't just copy/paste. Match the vibe of each platform.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return getDefaultCopy(suggestedTitle, platforms);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      youtube_title: parsed.youtube_title || null,
      youtube_description: parsed.youtube_description || null,
      youtube_tags: parsed.youtube_tags || [],
      facebook_text: parsed.facebook_text || suggestedTitle,
      instagram_caption: parsed.instagram_caption || suggestedTitle,
      tiktok_caption: parsed.tiktok_caption || suggestedTitle,
    };
  } catch {
    return getDefaultCopy(suggestedTitle, platforms);
  }
}

/**
 * Generate event promotion copy.
 */
export async function generateEventPromo(
  eventName: string,
  eventType: string,
  eventDate: string,
  eventLocation: string | null,
  description: string | null,
  promoType: "announcement" | "countdown" | "reminder" | "recap",
  daysUntil: number
): Promise<PlatformCopy> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: BRAND_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Generate a ${promoType} social media post for this event:

EVENT: ${eventName}
TYPE: ${eventType}
DATE: ${eventDate}
LOCATION: ${eventLocation || "TBA"}
DESCRIPTION: ${description || "N/A"}
DAYS UNTIL EVENT: ${daysUntil}
PROMO TYPE: ${promoType}

${promoType === "countdown" ? `This is a countdown post - ${daysUntil} days to go! Build excitement!` : ""}
${promoType === "reminder" ? "This is a last-minute reminder. Create urgency!" : ""}
${promoType === "recap" ? "This is a post-event recap. Celebrate the success and tease the next one!" : ""}
${promoType === "announcement" ? "This is the initial announcement. Generate hype!" : ""}

Respond ONLY with JSON:
{
  "youtube_title": null,
  "youtube_description": null,
  "youtube_tags": [],
  "facebook_text": "engaging Facebook post with emojis and hashtags",
  "instagram_caption": "Instagram caption with hashtags",
  "tiktok_caption": "short TikTok caption"
}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(jsonMatch?.[0] || "{}");
    return {
      youtube_title: parsed.youtube_title || null,
      youtube_description: parsed.youtube_description || null,
      youtube_tags: parsed.youtube_tags || [],
      facebook_text: parsed.facebook_text || `${eventName} - ${promoType}!`,
      instagram_caption: parsed.instagram_caption || `${eventName} ${HASHTAG_SETS.events.join(" ")}`,
      tiktok_caption: parsed.tiktok_caption || eventName,
    };
  } catch {
    return getDefaultCopy(eventName, ["facebook", "instagram", "tiktok"]);
  }
}

/**
 * Generate a thumbnail description prompt for Flux image generation.
 */
export async function generateThumbnailPrompt(
  title: string,
  transcript: string
): Promise<string> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `Generate a YouTube thumbnail image prompt for an AI image generator.

VIDEO TITLE: ${title}
TRANSCRIPT EXCERPT: ${transcript.slice(0, 500)}

The thumbnail should be:
- Eye-catching and colorful
- Include text overlay concept (the title or a hook)
- Dominican/Latin culture themed
- High contrast, bold
- YouTube clickbait style but authentic

Respond with ONLY the image generation prompt (1-2 sentences, no quotes).`,
      },
    ],
  });

  return response.content.find((b) => b.type === "text")?.text ||
    `Bold colorful YouTube thumbnail for "${title}", Dominican culture theme, energetic, eye-catching`;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function getDefaultCopy(title: string, platforms: Platform[]): PlatformCopy {
  const hashtags = [...HASHTAG_SETS.general, ...HASHTAG_SETS.culture].join(" ");
  return {
    youtube_title: platforms.includes("youtube") ? title : null,
    youtube_description: platforms.includes("youtube") ? `${title}\n\nFollow The Jose Show!\n${hashtags}` : null,
    youtube_tags: platforms.includes("youtube") ? ["thejoseshow", "dominican", "bachata", "entertainment"] : [],
    facebook_text: `${title} ${hashtags}`,
    instagram_caption: `${title}\n.\n.\n${hashtags}`,
    tiktok_caption: `${title} ${HASHTAG_SETS.general.slice(0, 5).join(" ")}`,
  };
}
