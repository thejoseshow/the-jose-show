import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { withCronLog } from "@/lib/cron-logger";
import { generateEventPromo } from "@/lib/claude";
import { getNextInstance } from "@/lib/recurrence";
import { getTemplateBySlug } from "@/lib/templates";
import { triggerRender } from "@/lib/remotion";
import type { Event, EventType, PromoScheduleItem } from "@/lib/types";

// Map event types to template slugs for creative direction
const EVENT_TYPE_TEMPLATE_MAP: Partial<Record<EventType, string>> = {
  bachata_class: "bachata-tip",
  dr_tour: "dr-tour-promo",
  dj_gig: "dj-set-highlight",
};

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronLog("event-promotions", async () => {
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Find non-recurring upcoming events within 30 days
  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("*")
    .eq("is_recurring", false)
    .gte("start_date", now.toISOString())
    .lte("start_date", thirtyDaysOut.toISOString())
    .order("start_date", { ascending: true });

  // Find all recurring events (their start_date may be in the past)
  const { data: recurringEvents } = await supabase
    .from("events")
    .select("*")
    .eq("is_recurring", true);

  // Build unified list of events to process with their effective date
  const eventsToProcess: Array<{ event: Event; eventDate: Date }> = [];

  for (const row of upcomingEvents || []) {
    eventsToProcess.push({ event: row as Event, eventDate: new Date(row.start_date) });
  }

  for (const row of recurringEvents || []) {
    const event = row as Event;
    const nextDate = getNextInstance(event, now);
    if (nextDate && nextDate <= thirtyDaysOut) {
      eventsToProcess.push({ event, eventDate: nextDate });
    }
  }

  if (!eventsToProcess.length) {
    return { generated: 0, message: "No upcoming events" };
  }

  let generated = 0;

  // Pre-fetch templates for event types
  const templateCache = new Map<string, { prompt_hint: string; hashtags: string[]; id: string }>();
  for (const slug of Object.values(EVENT_TYPE_TEMPLATE_MAP)) {
    if (slug && !templateCache.has(slug)) {
      const t = await getTemplateBySlug(slug);
      if (t) templateCache.set(slug, { prompt_hint: t.prompt_hint, hashtags: t.hashtags, id: t.id });
    }
  }

  for (const { event, eventDate } of eventsToProcess) {
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Look up template for this event type
    const templateSlug = EVENT_TYPE_TEMPLATE_MAP[event.type];
    const matchedTemplate = templateSlug ? templateCache.get(templateSlug) : undefined;

    // Default promo schedule if none set
    let promoSchedule: PromoScheduleItem[] = event.promo_schedule || [
      { days_before: 14, type: "announcement", generated: false },
      { days_before: 7, type: "countdown", generated: false },
      { days_before: 3, type: "countdown", generated: false },
      { days_before: 1, type: "reminder", generated: false },
      { days_before: -1, type: "recap", generated: false },
    ];

    // For recurring events: if all promos are generated and next instance is in the future,
    // reset flags for a fresh cycle
    if (event.is_recurring && promoSchedule.every((p) => p.generated)) {
      promoSchedule = promoSchedule.map((p) => ({
        ...p,
        generated: false,
        content_id: undefined,
      }));
    }

    for (const promo of promoSchedule) {
      // Check if this promo should fire today
      if (promo.generated) continue;
      if (Math.abs(daysUntil - promo.days_before) > 1) continue;

      try {
        // Always generate bilingual promos — Jose's audience is mostly Dominican/bilingual
        const copy = await generateEventPromo(
          event.name,
          event.type,
          eventDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
          event.location,
          event.description,
          promo.type,
          daysUntil,
          matchedTemplate ? { promptHint: matchedTemplate.prompt_hint, hashtags: matchedTemplate.hashtags } : undefined,
          true // bilingual
        );

        // Create content item for review
        const { data: content } = await supabase
          .from("content")
          .insert({
            event_id: event.id,
            type: "event_promo",
            status: "review",
            title: `${event.name} - ${promo.type}`,
            description: `Auto-generated ${promo.type} for ${event.name}`,
            facebook_text: copy.facebook_text,
            instagram_caption: copy.instagram_caption,
            tiktok_caption: copy.tiktok_caption,
            platforms: ["facebook", "instagram"],
            template_id: matchedTemplate?.id || null,
          })
          .select()
          .single();

        // Mark promo as generated
        promo.generated = true;
        if (content) promo.content_id = content.id;
        generated++;

        // Trigger Remotion EventPromo video render
        if (content && process.env.REMOTION_FUNCTION_NAME) {
          try {
            await triggerRender({
              compositionId: "EventPromo",
              contentId: content.id,
              inputProps: {
                eventName: event.name,
                eventDate: eventDate.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }),
                eventLocation: event.location || "",
                eventType: event.type,
                promoType: promo.type,
                daysUntil,
              },
            });
          } catch (renderErr) {
            console.error(`Failed to trigger EventPromo render for ${event.name}:`, renderErr);
          }
        }
      } catch (err) {
        console.error(`Failed to generate ${promo.type} for ${event.name}:`, err);
      }
    }

    // Update promo schedule
    await supabase
      .from("events")
      .update({
        promo_schedule: promoSchedule,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
  }

  return { generated };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
