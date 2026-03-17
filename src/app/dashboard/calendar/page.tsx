"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, CalendarClock } from "lucide-react";
import { startOfWeek, addDays, format } from "date-fns";
import { expandRecurringEvent } from "@/lib/recurrence";
import type { ContentListItem, Event, EventType, Platform } from "@/lib/types";

const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: "bg-red-500",
  facebook: "bg-blue-500",
  instagram: "bg-pink-500",
  tiktok: "bg-cyan-500",
};

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  bachata_class: "Bachata Class",
  dj_gig: "DJ / Hosting",
  starpoint_event: "Starpoint Event",
  rooftop_party: "Rooftop Party",
  dr_tour: "DR Tour",
  other: "Other",
};

interface DayItem {
  type: "event" | "content";
  id: string;
  label: string;
  status?: string;
  href: string;
  platforms?: Platform[];
  eventType?: string;
  scheduledAt?: string | null;
}

type ViewMode = "month" | "week";

export default function CalendarPage() {
  const [content, setContent] = useState<ContentListItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [currentWeekStart, setCurrentWeekStart] = useState(
    startOfWeek(new Date(), { weekStartsOn: 0 })
  );
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null); // YYYY-MM-DD
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const [contentRes, eventsRes] = await Promise.all([
        fetch("/api/content?limit=100"),
        fetch("/api/events"),
      ]);
      const contentData = await contentRes.json();
      const eventsData = await eventsRes.json();
      if (contentData.success) setContent(contentData.data || []);
      if (eventsData.success) setEvents(eventsData.data || []);
      setLoading(false);
    }
    load();
  }, []);

  // Month view data
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthDays = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day > 0 && day <= daysInMonth) {
      return format(new Date(year, month, day), "yyyy-MM-dd");
    }
    return null;
  });

  // Week view data: 7 days starting from currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    format(addDays(currentWeekStart, i), "yyyy-MM-dd")
  );

  // Compute the date range we need events for
  const visibleRange = useMemo(() => {
    if (viewMode === "week") {
      return {
        start: currentWeekStart,
        end: addDays(currentWeekStart, 6),
      };
    }
    return {
      start: new Date(year, month, 1),
      end: new Date(year, month + 1, 0),
    };
  }, [viewMode, currentWeekStart, year, month]);

  // Pre-compute event instances by YYYY-MM-DD key
  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();

    for (const event of events) {
      if (event.is_recurring && event.recurrence_rule) {
        const instances = expandRecurringEvent(event, visibleRange.start, visibleRange.end);
        for (const date of instances) {
          const key = format(date, "yyyy-MM-dd");
          const existing = map.get(key) || [];
          existing.push(event);
          map.set(key, existing);
        }
      } else {
        const eventDate = new Date(event.start_date);
        const key = format(eventDate, "yyyy-MM-dd");
        if (eventDate >= visibleRange.start && eventDate <= visibleRange.end) {
          const existing = map.get(key) || [];
          existing.push(event);
          map.set(key, existing);
        }
      }
    }

    return map;
  }, [events, visibleRange]);

  function getContentForDate(dateStr: string): ContentListItem[] {
    return content.filter((c) => {
      const d = c.scheduled_at || c.published_at || c.created_at;
      return d?.startsWith(dateStr);
    });
  }

  function getEventsForDate(dateStr: string): Event[] {
    return eventsByDay.get(dateStr) || [];
  }

  function getDayItems(dateStr: string): DayItem[] {
    const items: DayItem[] = [];
    for (const e of getEventsForDate(dateStr)) {
      items.push({
        type: "event",
        id: e.id,
        label: e.name,
        href: "/dashboard/events",
        eventType: EVENT_TYPE_LABELS[e.type] || e.type,
      });
    }
    for (const c of getContentForDate(dateStr)) {
      items.push({
        type: "content",
        id: c.id,
        label: c.title,
        status: c.status,
        href: `/dashboard/content/${c.id}`,
        platforms: c.platforms,
        scheduledAt: c.scheduled_at,
      });
    }
    return items;
  }

  // Navigation
  function navigatePrev() {
    if (viewMode === "week") {
      setCurrentWeekStart((prev) => addDays(prev, -7));
    } else {
      setCurrentMonth(new Date(year, month - 1, 1));
    }
  }

  function navigateNext() {
    if (viewMode === "week") {
      setCurrentWeekStart((prev) => addDays(prev, 7));
    } else {
      setCurrentMonth(new Date(year, month + 1, 1));
    }
  }

  function navigateToday() {
    const now = new Date();
    setCurrentMonth(now);
    setCurrentWeekStart(startOfWeek(now, { weekStartsOn: 0 }));
  }

  // Reschedule
  async function handleReschedule(contentId: string) {
    if (!rescheduleValue) return;
    setRescheduleSaving(true);
    try {
      const res = await fetch(`/api/content/${contentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: new Date(rescheduleValue).toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        setContent((prev) =>
          prev.map((c) =>
            c.id === contentId ? { ...c, scheduled_at: data.data.scheduled_at } : c
          )
        );
        setReschedulingId(null);
        setRescheduleValue("");
      }
    } catch {
      // silently fail
    }
    setRescheduleSaving(false);
  }

  const headerLabel =
    viewMode === "week"
      ? `${format(currentWeekStart, "MMM d")} - ${format(addDays(currentWeekStart, 6), "MMM d, yyyy")}`
      : currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const selectedDayItems = selectedDay ? getDayItems(selectedDay) : [];

  // Parse selectedDay for Sheet title
  const selectedDayDate = selectedDay ? new Date(selectedDay + "T12:00:00") : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Publishing Calendar</h1>
        <div className="flex items-center gap-2">
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={navigateToday}>
            Today
          </Button>
          <span className="text-lg font-medium text-center min-w-[160px]">{headerLabel}</span>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Color Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-red-600/40 border-l-2 border-red-500" />
          Events
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-green-600/40" />
          Published
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-blue-600/40" />
          Approved
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-muted" />
          Draft / Review
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-7 gap-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-center text-xs text-muted-foreground py-2 font-medium">
                {d}
              </div>
            ))}

            {viewMode === "month"
              ? monthDays.map((dateStr, i) => (
                  <DayCell
                    key={i}
                    dateStr={dateStr}
                    isWeekView={false}
                    getEventsForDate={getEventsForDate}
                    getContentForDate={getContentForDate}
                    onSelect={setSelectedDay}
                  />
                ))
              : weekDays.map((dateStr, i) => (
                  <DayCell
                    key={i}
                    dateStr={dateStr}
                    isWeekView={true}
                    getEventsForDate={getEventsForDate}
                    getContentForDate={getContentForDate}
                    onSelect={setSelectedDay}
                  />
                ))}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Sheet */}
      <Sheet open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selectedDayDate?.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedDayItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled for this day.</p>
            ) : (
              selectedDayItems.map((item) => (
                <div
                  key={`${item.type}-${item.id}`}
                  className="p-3 rounded-lg border hover:border-muted-foreground/50 transition-colors"
                >
                  <Link href={item.href} className="block">
                    <div className="flex items-center gap-2">
                      {item.type === "event" ? (
                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                      ) : (
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            item.status === "published"
                              ? "bg-green-500"
                              : item.status === "approved"
                              ? "bg-blue-500"
                              : "bg-gray-500"
                          }`}
                        />
                      )}
                      <span className="text-sm truncate">{item.label}</span>
                      {item.type === "event" && item.eventType && (
                        <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                          {item.eventType}
                        </Badge>
                      )}
                      {item.type === "content" && (
                        <Badge
                          className={`ml-auto text-[10px] shrink-0 ${
                            item.status === "published"
                              ? "bg-green-600/20 text-green-400 border-green-500/30"
                              : item.status === "approved"
                              ? "bg-blue-600/20 text-blue-400 border-blue-500/30"
                              : "bg-muted text-muted-foreground"
                          }`}
                          variant="outline"
                        >
                          {item.status}
                        </Badge>
                      )}
                    </div>
                    {/* Platform dots for content */}
                    {item.platforms && item.platforms.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 ml-4">
                        {item.platforms.map((p) => (
                          <span
                            key={p}
                            className={`w-2 h-2 rounded-full ${PLATFORM_COLORS[p] || "bg-gray-500"}`}
                            title={p}
                          />
                        ))}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {item.platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Reschedule button for content items */}
                  {item.type === "content" && (
                    <div className="mt-2 ml-4">
                      {reschedulingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            type="datetime-local"
                            value={rescheduleValue}
                            onChange={(e) => setRescheduleValue(e.target.value)}
                            className="h-8 text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!rescheduleValue || rescheduleSaving}
                            onClick={() => handleReschedule(item.id)}
                          >
                            {rescheduleSaving ? "..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => {
                              setReschedulingId(null);
                              setRescheduleValue("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => {
                            setReschedulingId(item.id);
                            // Pre-fill with existing scheduled_at if available
                            if (item.scheduledAt) {
                              setRescheduleValue(
                                new Date(item.scheduledAt).toISOString().slice(0, 16)
                              );
                            }
                          }}
                        >
                          <CalendarClock className="w-3 h-3 mr-1" />
                          Reschedule
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DayCell({
  dateStr,
  isWeekView,
  getEventsForDate,
  getContentForDate,
  onSelect,
}: {
  dateStr: string | null;
  isWeekView: boolean;
  getEventsForDate: (d: string) => Event[];
  getContentForDate: (d: string) => ContentListItem[];
  onSelect: (d: string) => void;
}) {
  if (!dateStr) {
    return <div className="min-h-[100px] bg-transparent border-transparent" />;
  }

  const dayEvents = getEventsForDate(dateStr);
  const dayContent = getContentForDate(dateStr);
  const totalItems = dayEvents.length + dayContent.length;
  const parsed = new Date(dateStr + "T12:00:00");
  const dayNum = parsed.getDate();
  const now = new Date();
  const isToday =
    dayNum === now.getDate() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getFullYear() === now.getFullYear();

  return (
    <div
      className={`${
        isWeekView ? "min-h-[250px]" : "min-h-[100px]"
      } p-2 rounded-lg border cursor-pointer transition-colors bg-muted/30 border-border hover:border-muted-foreground/50 ${
        isToday ? "border-primary/50 bg-primary/5" : ""
      }`}
      onClick={() => totalItems > 0 && onSelect(dateStr)}
    >
      <span
        className={`text-xs ${
          isToday
            ? "bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full"
            : "text-muted-foreground"
        }`}
      >
        {dayNum}
      </span>
      <div className="mt-1 space-y-1">
        {dayEvents.slice(0, isWeekView ? 6 : 3).map((e, idx) => (
          <div
            key={`${e.id}-${idx}`}
            className="block text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 border-red-500 bg-red-600/20 text-red-400"
          >
            {e.name}
          </div>
        ))}
        {dayContent
          .slice(0, Math.max(0, (isWeekView ? 6 : 3) - dayEvents.length))
          .map((c) => (
            <div
              key={c.id}
              className={`block text-[10px] px-1.5 py-0.5 rounded truncate ${
                c.status === "published"
                  ? "bg-green-600/20 text-green-400"
                  : c.status === "approved"
                  ? "bg-blue-600/20 text-blue-400"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {c.title}
            </div>
          ))}
        {totalItems > (isWeekView ? 6 : 3) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(dateStr);
            }}
          >
            <Badge variant="secondary" className="text-[10px] px-1 py-0 cursor-pointer">
              +{totalItems - (isWeekView ? 6 : 3)} more
            </Badge>
          </button>
        )}
      </div>
    </div>
  );
}
