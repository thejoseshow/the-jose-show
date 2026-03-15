import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { getWeeklyScheduleSuggestions } from "@/lib/templates";
import { generateTemplatedCopy } from "@/lib/claude";
import { withCronLog } from "@/lib/cron-logger";
import type { Platform } from "@/lib/types";

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("suggest-content", async () => {
  const suggestions = await getWeeklyScheduleSuggestions();
  if (!suggestions.length) {
    return { created: 0, message: "No templates due this week" };
  }

  // Week start (Monday) for dedup
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().split("T")[0];

  let created = 0;

  for (const template of suggestions) {
    // Dedup by template_id + week range
    const { data: existing } = await supabase
      .from("content")
      .select("id")
      .eq("template_id", template.id)
      .gte("created_at", weekStart.toISOString())
      .limit(1);

    if (existing && existing.length > 0) continue;

    // Calculate scheduled date using preferred day
    const scheduledDate = new Date(weekStart);
    if (template.preferred_day !== null && template.preferred_day !== undefined) {
      // preferred_day: 0=Sun..6=Sat, weekStart is Monday (1)
      const offset = (template.preferred_day - 1 + 7) % 7;
      scheduledDate.setDate(weekStart.getDate() + offset);
    }
    scheduledDate.setHours(10, 0, 0, 0); // Default 10 AM

    const title = `${template.prefix} - Week of ${weekStartStr}`;
    const platforms = template.default_platforms as Platform[];

    // Insert content with template_id
    const { data: content, error: insertErr } = await supabase
      .from("content")
      .insert({
        type: "post",
        status: "draft",
        title,
        description: template.description,
        platforms,
        scheduled_at: scheduledDate.toISOString(),
        template_id: template.id,
      })
      .select()
      .single();

    if (insertErr || !content) {
      console.error(`[suggest-content] Failed to insert for ${template.slug}:`, insertErr?.message);
      continue;
    }

    // Generate AI copy
    try {
      const copy = await generateTemplatedCopy(
        title,
        platforms,
        {
          promptHint: template.prompt_hint,
          hashtags: template.hashtags,
          prefix: template.prefix,
          description: template.description,
        }
      );

      await supabase
        .from("content")
        .update({
          youtube_title: copy.youtube_title,
          youtube_description: copy.youtube_description,
          youtube_tags: copy.youtube_tags,
          facebook_text: copy.facebook_text,
          instagram_caption: copy.instagram_caption,
          tiktok_caption: copy.tiktok_caption,
          status: "review",
          updated_at: new Date().toISOString(),
        })
        .eq("id", content.id);
    } catch (err) {
      // Fallback: keep as draft with empty captions
      console.error(`[suggest-content] AI generation failed for ${template.slug}:`, err);
    }

    created++;
  }

  return { created };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
