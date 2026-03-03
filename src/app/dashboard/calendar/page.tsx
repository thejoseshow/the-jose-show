"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ContentListItem } from "@/lib/types";

export default function CalendarPage() {
  const [content, setContent] = useState<ContentListItem[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/content?limit=100");
      const data = await res.json();
      if (data.success) setContent(data.data || []);
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

  function getContentForDay(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return content.filter((c) => {
      const d = c.scheduled_at || c.published_at || c.created_at;
      return d?.startsWith(dateStr);
    });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Publishing Calendar</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-medium min-w-[200px] text-center">{monthName}</span>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
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
              const dayContent = day ? getContentForDay(day) : [];
              const isToday =
                day === new Date().getDate() &&
                month === new Date().getMonth() &&
                year === new Date().getFullYear();

              return (
                <div
                  key={i}
                  className={`min-h-[100px] p-2 rounded-lg border ${
                    day
                      ? "bg-muted/30 border-border"
                      : "bg-transparent border-transparent"
                  } ${isToday ? "border-primary/50 bg-primary/5" : ""}`}
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
                        {dayContent.slice(0, 3).map((c) => (
                          <Link
                            key={c.id}
                            href={`/dashboard/content/${c.id}`}
                            className={`block text-[10px] px-1.5 py-0.5 rounded truncate ${
                              c.status === "published"
                                ? "bg-green-600/20 text-green-400"
                                : c.status === "approved"
                                ? "bg-blue-600/20 text-blue-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.title}
                          </Link>
                        ))}
                        {dayContent.length > 3 && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            +{dayContent.length - 3} more
                          </Badge>
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
    </div>
  );
}
