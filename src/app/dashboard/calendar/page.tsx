"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { expandRecurringEvent } from "@/lib/recurrence";
import type { ContentListItem, Event } from "@/lib/types";

interface DayItem {
  type: "event" | "content";
  id: string;
  label: string;
  status?: string;
  href: string;
}

export default function CalendarPage() {
  const [content, setContent] = useState<ContentListItem[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  // Pre-compute event instances for the current month (handles recurring events)
  const eventsByDay = useMemo(() => {
    const map = new Map<number, Event[]>();
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    for (const event of events) {
      if (event.is_recurring && event.recurrence_rule) {
        const instances = expandRecurringEvent(event, monthStart, monthEnd);
        for (const date of instances) {
          if (date.getMonth() === month && date.getFullYear() === year) {
            const d = date.getDate();
            const existing = map.get(d) || [];
            existing.push(event);
            map.set(d, existing);
          }
        }
      } else {
        const eventDate = new Date(event.start_date);
        if (eventDate.getMonth() === month && eventDate.getFullYear() === year) {
          const d = eventDate.getDate();
          const existing = map.get(d) || [];
          existing.push(event);
          map.set(d, existing);
        }
      }
    }

    return map;
  }, [events, year, month]);

  function getContentForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return content.filter((c) => {
      const d = c.scheduled_at || c.published_at || c.created_at;
      return d?.startsWith(dateStr);
    });
  }

  function getEventsForDay(day: number): Event[] {
    return eventsByDay.get(day) || [];
  }

  function getDayItems(day: number): DayItem[] {
    const items: DayItem[] = [];
    for (const e of getEventsForDay(day)) {
      items.push({ type: "event", id: e.id, label: e.name, href: "/dashboard/events" });
    }
    for (const c of getContentForDay(day)) {
      items.push({
        type: "content",
        id: c.id,
        label: c.title,
        status: c.status,
        href: `/dashboard/content/${c.id}`,
      });
    }
    return items;
  }

  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const selectedDayItems = selectedDay ? getDayItems(selectedDay) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Publishing Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentMonth(new Date())}
          >
            Today
          </Button>
          <span className="text-lg font-medium text-center">{monthName}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
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

            {days.map((day, i) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const dayContent = day ? getContentForDay(day) : [];
              const totalItems = dayEvents.length + dayContent.length;
              const isToday =
                day === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

              return (
                <div
                  key={i}
                  className={`min-h-[100px] p-2 rounded-lg border cursor-pointer transition-colors ${
                    day
                      ? "bg-muted/30 border-border hover:border-muted-foreground/50"
                      : "bg-transparent border-transparent cursor-default"
                  } ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
                  onClick={() => day && totalItems > 0 && setSelectedDay(day)}
                >
                  {day && (
                    <>
                      <span
                        className={`text-xs ${
                          isToday
                            ? "bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full"
                            : "text-muted-foreground"
                        }`}
                      >
                        {day}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayEvents.slice(0, 3).map((e, idx) => (
                          <div
                            key={`${e.id}-${idx}`}
                            className="block text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 border-red-500 bg-red-600/20 text-red-400"
                          >
                            {e.name}
                          </div>
                        ))}
                        {dayContent.slice(0, Math.max(0, 3 - dayEvents.length)).map((c) => (
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
                        {totalItems > 3 && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedDay(day); }}
                          >
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 cursor-pointer">
                              +{totalItems - 3} more
                            </Badge>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Day Detail Sheet */}
      <Sheet open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selectedDay && new Date(year, month, selectedDay).toLocaleDateString("en-US", {
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
                <Link
                  key={`${item.type}-${item.id}`}
                  href={item.href}
                  className="block p-3 rounded-lg border hover:border-muted-foreground/50 transition-colors"
                >
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
                    <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                      {item.type === "event" ? "Event" : item.status}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
