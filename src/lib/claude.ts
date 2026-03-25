import Anthropic from "@anthropic-ai/sdk";
import { BRAND_VOICE, HASHTAG_SETS, PLATFORM_LIMITS, YOUTUBE_SOCIAL_LINKS, YOUTUBE_SUBSCRIBE_CTA, YOUTUBE_HASHTAGS } from "./constants";
import type { Platform } from "./types";

let _client: Anthropic | null = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// Use Haiku for fast, cheap content generation (~$0.01 per piece)
const MODEL = "claude-haiku-4-5";

const BRAND_SYSTEM_PROMPT = `You are a social media content writer for "${BRAND_VOICE.showName}" hosted by ${BRAND_VOICE.name}.

WHO IS JOSE: ${BRAND_VOICE.bio}

BRAND VOICE:
- Tone: ${BRAND_VOICE.tone.join("; ")}
- Topics: ${BRAND_VOICE.topics.join(", ")}
- Naturally mix in Dominican Spanish phrases like: ${BRAND_VOICE.spanishPhrases.join(", ")}
- DO NOT: ${BRAND_VOICE.doNot.join("; ")}

CRITICAL - CONTENT TYPE DETECTION:
Most of Jose's videos are him DANCING bachata or practicing footwork. When the transcript is song lyrics or music (Spanish romantic/bachata lyrics), the video shows Jose DANCING — NOT singing.
- If transcript = song lyrics → title about DANCING, FOOTWORK, PRACTICE, or the VIBE of the dance
- If transcript = Jose talking → title about what he's discussing
- If transcript = conversation → could be teaching, podcast, or vlog
Content types: ${BRAND_VOICE.contentTypes.join("; ")}

TITLE STYLE EXAMPLES for dance clips:
- "Working on my footwork 🔥" NOT "Best meditation is your kiss"
- "This bachata hit different today 💃" NOT song lyric quotes
- "Dominican style footwork practice" NOT translations of the lyrics
- "When the music takes over 🎵" (about the dancing, not the words)

PLATFORMS:
- YouTube (@Thejoseshowtv): Longer videos up to 8 min, entertainment/culture/dance content
- Facebook (thejoseadelshow): Community engagement, event sharing
- Instagram (thejoseadelshow): Reels under 60s, visual storytelling
- TikTok (@thejoseshow_): Short viral clips under 60s, trending sounds/formats

Always write in Jose's authentic voice. Be energetic, warm, and proud of Dominican culture.`;

/**
 * Analyze a photo visually with Claude and return a title + scene description.
 * Used for photos dropped into Google Drive (no transcript/clips needed).
 */
export async function analyzePhotoContent(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ title: string; visualContext: string }> {
  const client = getClient();

  // Normalize MIME type for the API
  const mediaType = (
    mimeType === "image/heic" || mimeType === "image/heif" ? "image/jpeg" : mimeType
  ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: BRAND_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: mediaType,
              data: imageBuffer.toString("base64"),
            },
          },
          {
            type: "text" as const,
            text: `This is a photo from Jose's phone (Dominican dancer/entertainer/content creator).

Describe the scene in 2-3 sentences, then suggest a catchy social media title.

Focus on:
- What is Jose doing? (dancing, eating, at an event, with family, traveling, etc.)
- Where is he? (studio, restaurant, club, beach, home, DR, etc.)
- Who else is in the photo? (alone, wife Johanna, son Max, students, crowd, etc.)
- What's the vibe? (fun, romantic, energetic, chill, family time, etc.)

Respond ONLY with JSON:
{"title": "short catchy title for social media", "visualContext": "2-3 sentence scene description"}`,
          },
        ],
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(jsonMatch?.[0] || "{}");
    return {
      title: parsed.title || "New photo from Jose",
      visualContext: parsed.visualContext || "",
    };
  } catch {
    return { title: "New photo from Jose", visualContext: "" };
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
  isSpanish = false,
  visualContext?: string,
  isShort = false,
  learningContext?: string
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
${learningContext ? `\n${learningContext}\n` : ""}${isShort && platforms.includes("youtube") ? `
YOUTUBE SHORTS OPTIMIZATION:
- This is a YouTube Short (vertical video under 60 seconds)
- YouTube title MUST be under 60 characters — shorter = better for Shorts
- Include "#Shorts" as the FIRST tag in youtube_tags
- Title should be punchy scroll-stopping hooks with 1-2 hashtags at the end: "Wait for it... #bachata", "This hit different #footwork 🔥"
- DO NOT use long descriptive titles — Shorts need hooks that stop the scroll
- youtube_description: short hook paragraph + social links block:
${YOUTUBE_SOCIAL_LINKS}
${YOUTUBE_SUBSCRIBE_CTA}
- Tags: "#Shorts" first, then 5-8 search-oriented tags ("bachata footwork tutorial" not just "dance")
` : ""}${!isShort && platforms.includes("youtube") ? `
YOUTUBE LONG-FORM SEO OPTIMIZATION:
- YouTube title: 70-100 characters, put the hook/keyword in the FIRST 50 chars (that's what shows on mobile)
- youtube_description MUST follow this structure:
  1. Hook paragraph — primary keyword in the first 25 words
  2. Brief content summary (2-3 sentences)
  3. Timestamps placeholder: "0:00 Intro"
  4. Social links block:
${YOUTUBE_SOCIAL_LINKS}
  5. Subscribe CTA:
${YOUTUBE_SUBSCRIBE_CTA}
  6. 3-5 hashtags at the end from: ${Object.values(YOUTUBE_HASHTAGS).flat().slice(0, 15).join(" ")}
- Tags: 5-8 search-oriented tags ("bachata footwork tutorial", "dominican style dance", "learn bachata") — NOT generic ("dance", "fun")
` : ""}${!isShort && platforms.includes("facebook") ? `
FACEBOOK LONG-FORM OPTIMIZATION:
- This is a longer video — write a detailed, engaging Facebook post
- Include a hook in the first line (this shows in previews)
- Add 2-3 paragraphs of context about what's in the video
- End with a call-to-action (comment, share, tag a friend)
- Include relevant hashtags at the end
` : ""}
CLIP TRANSCRIPT:
${clipTranscript}

SUGGESTED TITLE: ${suggestedTitle}
TARGET PLATFORMS: ${platforms.join(", ")}
LANGUAGE: ${isSpanish ? "The video is primarily in SPANISH. Write captions in Spanish first, then add an English translation or mix. Make hashtags bilingual." : "The video is primarily in ENGLISH. Sprinkle in Dominican Spanish phrases naturally as Jose would."}
${visualContext ? `\nVISUAL CONTEXT (what's actually happening in the video): ${visualContext}\nIMPORTANT: Use this visual description to write accurate captions. If Jose is at a bar with his wife, write about THAT — not whatever song is playing.\n` : ""}
IMPORTANT: If the transcript is song lyrics (not Jose talking), this is NOT necessarily a dance clip — check the visual context. Write copy about what Jose is actually DOING, not about the song lyrics. The title should reflect what's happening visually.

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
  daysUntil: number,
  templateContext?: { promptHint: string; hashtags: string[] },
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
${templateContext ? `\nCREATIVE DIRECTION: ${templateContext.promptHint}\nHASHTAGS TO INCLUDE: ${templateContext.hashtags.join(" ")}` : ""}
LANGUAGE: ${isSpanish ? "Write captions in Spanish first, then add English translation. Make hashtags bilingual. Jose's audience is mostly Dominican/bilingual." : "Write in English. Sprinkle in Dominican Spanish phrases naturally as Jose would."}

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
 * Generate platform-specific copy using a content template's creative direction.
 */
export async function generateTemplatedCopy(
  title: string,
  platforms: Platform[],
  templateContext: { promptHint: string; hashtags: string[]; prefix: string; description: string | null },
  additionalContext?: string,
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
        content: `Generate social media copy for this content piece.

CONTENT TITLE: ${title}
TEMPLATE SERIES: ${templateContext.prefix}
TEMPLATE DESCRIPTION: ${templateContext.description || "N/A"}
CREATIVE DIRECTION: ${templateContext.promptHint}
TARGET PLATFORMS: ${platforms.join(", ")}
${additionalContext ? `ADDITIONAL CONTEXT: ${additionalContext}` : ""}
LANGUAGE: ${isSpanish ? "Write captions in Spanish first, then add an English translation or mix. Make hashtags bilingual." : "Write in English. Sprinkle in Dominican Spanish phrases naturally as Jose would."}

HASHTAGS TO INCLUDE: ${templateContext.hashtags.join(" ")}

Generate copy for EACH platform. Respond ONLY with JSON:
{
  "youtube_title": "catchy title under ${PLATFORM_LIMITS.youtube.titleMaxLength} chars (null if not targeting YouTube)",
  "youtube_description": "detailed description with links to socials (null if not targeting YouTube)",
  "youtube_tags": ["tag1", "tag2", ...up to ${PLATFORM_LIMITS.youtube.maxTags} tags],
  "facebook_text": "engaging post text with emojis and hashtags",
  "instagram_caption": "caption under ${PLATFORM_LIMITS.instagram.captionMaxLength} chars with hashtags (max ${PLATFORM_LIMITS.instagram.maxHashtags})",
  "tiktok_caption": "short punchy caption under ${PLATFORM_LIMITS.tiktok.captionMaxLength} chars with trending hashtags"
}

Make each platform's copy unique - don't just copy/paste. Match the vibe of each platform.
Follow the creative direction closely and incorporate the provided hashtags naturally.`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return getDefaultCopy(title, platforms);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      youtube_title: parsed.youtube_title || null,
      youtube_description: parsed.youtube_description || null,
      youtube_tags: parsed.youtube_tags || [],
      facebook_text: parsed.facebook_text || title,
      instagram_caption: parsed.instagram_caption || title,
      tiktok_caption: parsed.tiktok_caption || title,
    };
  } catch {
    return getDefaultCopy(title, platforms);
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
        content: `Generate a YouTube thumbnail image prompt for an AI image generator (Flux).

VIDEO TITLE: ${title}
TRANSCRIPT EXCERPT: ${transcript.slice(0, 500)}

The thumbnail MUST follow 2026 YouTube best practices:
- ONE person's face close-up showing STRONG EMOTION (surprise, excitement, joy, intensity)
- Minimal bold text: 3-5 words MAX, large readable font
- Extremely high contrast, vibrant saturated colors
- Clean uncluttered background — face is the focus
- 1280x720 landscape format
- Dominican/Latin culture themed where appropriate
- NO busy backgrounds, NO small text, NO multiple people

Respond with ONLY the image generation prompt (1-2 sentences, no quotes).`,
      },
    ],
  });

  return response.content.find((b) => b.type === "text")?.text ||
    `Bold colorful YouTube thumbnail for "${title}", Dominican culture theme, energetic, eye-catching`;
}

/**
 * Generate weekly performance insights using Claude.
 */
export async function generateWeeklyInsights(
  snapshots: Array<{
    content_id: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    watch_time_seconds: number | null;
  }>,
  contentData: Array<{
    id: string;
    title: string;
    type: string;
    platforms: string[];
    published_at: string | null;
  }>
): Promise<{
  top_insights: string[];
  content_type_rankings: Array<{ type: string; avg_engagement: number }>;
  platform_rankings: Array<{ platform: string; total_views: number; avg_engagement: number }>;
  recommended_hashtags: string[];
  suggested_content_ideas: string[];
  week_summary: string;
}> {
  const client = getClient();

  const totalViews = snapshots.reduce((sum, s) => sum + s.views, 0);
  const totalLikes = snapshots.reduce((sum, s) => sum + s.likes, 0);
  const totalComments = snapshots.reduce((sum, s) => sum + s.comments, 0);
  const totalShares = snapshots.reduce((sum, s) => sum + s.shares, 0);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: `You are a social media performance coach for "The Jose Show" hosted by Jose Gomez. Jose is a Dominican dancer, DJ, event host, and content creator based in South Florida. His content includes bachata dancing/footwork, events (Muevete Brunch), vlogs, family content, and DJ sets. Analyze the data and provide actionable, specific insights.`,
    messages: [
      {
        role: "user",
        content: `Analyze this week's social media performance for The Jose Show.

METRICS SUMMARY:
- Total Views: ${totalViews}
- Total Likes: ${totalLikes}
- Total Comments: ${totalComments}
- Total Shares: ${totalShares}
- Content Published: ${contentData.length} pieces

PER-PLATFORM BREAKDOWN:
${["youtube", "facebook", "instagram", "tiktok"]
  .map((p) => {
    const platSnaps = snapshots.filter((s) => s.platform === p);
    const views = platSnaps.reduce((s, x) => s + x.views, 0);
    const likes = platSnaps.reduce((s, x) => s + x.likes, 0);
    return `${p}: ${views} views, ${likes} likes`;
  })
  .join("\n")}

PUBLISHED CONTENT:
${contentData
  .map((c) => `- "${c.title}" (${c.type}, ${c.platforms.join("/")})`)
  .join("\n") || "No content published this week"}

Respond ONLY with JSON:
{
  "top_insights": ["insight 1", "insight 2", "insight 3"],
  "content_type_rankings": [{"type": "dance", "avg_engagement": 5.2}],
  "platform_rankings": [{"platform": "instagram", "total_views": 1000, "avg_engagement": 4.5}],
  "recommended_hashtags": ["#bachata", "#dominican"],
  "suggested_content_ideas": ["idea 1", "idea 2", "idea 3"],
  "week_summary": "One paragraph summary of the week's performance"
}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text || "{}";
  const jsonMatch = text.match(/\{[\s\S]*\}/);

  try {
    const parsed = JSON.parse(jsonMatch?.[0] || "{}");
    return {
      top_insights: parsed.top_insights || [],
      content_type_rankings: parsed.content_type_rankings || [],
      platform_rankings: parsed.platform_rankings || [],
      recommended_hashtags: parsed.recommended_hashtags || [],
      suggested_content_ideas: parsed.suggested_content_ideas || [],
      week_summary: parsed.week_summary || "No data available for analysis.",
    };
  } catch {
    return {
      top_insights: ["Unable to generate insights from available data"],
      content_type_rankings: [],
      platform_rankings: [],
      recommended_hashtags: [],
      suggested_content_ideas: [],
      week_summary: "Insufficient data for analysis this week.",
    };
  }
}

/**
 * Generate two A/B variant sets of platform copy in a single Claude call.
 * Variant A = safe/optimized, Variant B = experimental/different hook.
 * Falls back to calling generatePlatformCopy() twice if structured output fails.
 */
export async function generatePlatformCopyVariants(
  clipTranscript: string,
  suggestedTitle: string,
  platforms: Platform[],
  isSpanish = false,
  visualContext?: string,
  isShort = false,
  learningContext?: string
): Promise<{ variantA: PlatformCopy; variantB: PlatformCopy }> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: BRAND_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate TWO variants of social media copy for A/B testing this video clip.
${learningContext ? `\n${learningContext}\n` : ""}
CLIP TRANSCRIPT:
${clipTranscript}

SUGGESTED TITLE: ${suggestedTitle}
TARGET PLATFORMS: ${platforms.join(", ")}
LANGUAGE: ${isSpanish ? "Spanish primary, English secondary" : "English primary, sprinkle Dominican Spanish"}
${visualContext ? `\nVISUAL CONTEXT: ${visualContext}\n` : ""}
VARIANT A: Safe/optimized — use proven hooks, standard hashtags, clear value proposition.
VARIANT B: Experimental — try a different angle, unexpected hook, edgier tone, or trending format.

Both variants should be high-quality but DISTINCTLY DIFFERENT in approach.

Respond ONLY with JSON:
{
  "variantA": {
    "youtube_title": "...",
    "youtube_description": "...",
    "youtube_tags": [...],
    "facebook_text": "...",
    "instagram_caption": "...",
    "tiktok_caption": "..."
  },
  "variantB": {
    "youtube_title": "...",
    "youtube_description": "...",
    "youtube_tags": [...],
    "facebook_text": "...",
    "instagram_caption": "...",
    "tiktok_caption": "..."
  }
}`,
        },
      ],
    });

    const text = response.content.find((b) => b.type === "text")?.text || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.variantA && parsed.variantB) {
        const normalize = (v: Record<string, unknown>): PlatformCopy => ({
          youtube_title: (v.youtube_title as string) || null,
          youtube_description: (v.youtube_description as string) || null,
          youtube_tags: (v.youtube_tags as string[]) || [],
          facebook_text: (v.facebook_text as string) || suggestedTitle,
          instagram_caption: (v.instagram_caption as string) || suggestedTitle,
          tiktok_caption: (v.tiktok_caption as string) || suggestedTitle,
        });
        return { variantA: normalize(parsed.variantA), variantB: normalize(parsed.variantB) };
      }
    }
  } catch (err) {
    console.error("A/B variant generation failed, falling back to two calls:", err);
  }

  // Fallback: two separate calls
  const [variantA, variantB] = await Promise.all([
    generatePlatformCopy(clipTranscript, suggestedTitle, platforms, isSpanish, visualContext, isShort, learningContext),
    generatePlatformCopy(clipTranscript, suggestedTitle, platforms, isSpanish, visualContext, isShort, learningContext),
  ]);
  return { variantA, variantB };
}

function getDefaultCopy(title: string, platforms: Platform[]): PlatformCopy {
  const hashtags = [...HASHTAG_SETS.general, ...HASHTAG_SETS.culture].join(" ");
  const ytHashtags = YOUTUBE_HASHTAGS.general.join(" ");
  return {
    youtube_title: platforms.includes("youtube") ? title : null,
    youtube_description: platforms.includes("youtube")
      ? `${title}\n\n${YOUTUBE_SOCIAL_LINKS}\n\n${YOUTUBE_SUBSCRIBE_CTA}\n\n${ytHashtags}`
      : null,
    youtube_tags: platforms.includes("youtube")
      ? ["thejoseshow", "bachata dominican style", "dominican dancer", "south florida entertainment", "bachata footwork"]
      : [],
    facebook_text: `${title} ${hashtags}`,
    instagram_caption: `${title}\n.\n.\n${hashtags}`,
    tiktok_caption: `${title} ${HASHTAG_SETS.general.slice(0, 5).join(" ")}`,
  };
}
