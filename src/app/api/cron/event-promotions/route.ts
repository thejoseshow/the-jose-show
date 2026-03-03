import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { generateEventPromo } from "@/lib/claude";
import type { Event, PromoScheduleItem } from "@/lib/types";

// GET /api/cron/event-promotions - Auto-generate promo posts for upcoming events
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Find upcoming events within 30 days
  const { data: events, error } = await supabase
    .from("events")
    .select("*")
    .gte("start_date", now.toISOString())
    .lte("start_date", thirtyDaysOut.toISOString())
    .order("start_date", { ascending: true });

  if (error || !events?.length) {
    return NextResponse.json({ success: true, generated: 0, message: "No upcoming events" });
  }

  let generated = 0;

  for (const eventRow of events) {
    const event = eventRow as Event;
    const eventDate = new Date(event.start_date);
    const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // Default promo schedule if none set
    const promoSchedule: PromoScheduleItem[] = event.promo_schedule || [
      { days_before: 14, type: "announcement", generated: false },
      { days_before: 7, type: "countdown", generated: false },
      { days_before: 3, type: "countdown", generated: false },
      { days_before: 1, type: "reminder", generated: false },
      { days_before: -1, type: "recap", generated: false },
    ];

    for (const promo of promoSchedule) {
      // Check if this promo should fire today
      if (promo.generated) continue;
      if (Math.abs(daysUntil - promo.days_before) > 0) continue;

      try {
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
          daysUntil
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
          })
          .select()
          .single();

        // Mark promo as generated
        promo.generated = true;
        if (content) promo.content_id = content.id;
        generated++;
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

  return NextResponse.json({ success: true, generated });
}
