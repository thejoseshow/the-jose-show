"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PlatformHealth from "@/components/PlatformHealth";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Video, RefreshCw, Eye, CheckCircle } from "lucide-react";
import type { DashboardStats, ContentListItem } from "@/lib/types";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentContent, setRecentContent] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, contentRes] = await Promise.all([
          fetch("/api/content?stats=true"),
          fetch("/api/content?limit=5&sort=created_at"),
        ]);
        const statsData = await statsRes.json();
        const contentData = await contentRes.json();
        if (statsData.success) setStats(statsData.data);
        if (contentData.success) setRecentContent(contentData.data || []);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Welcome back, Jose</p>
        </div>
        <Button variant="secondary" asChild>
          <Link href="/api/auth/google">Connect Google</Link>
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Videos"
          value={stats?.total_videos ?? 0}
          icon={<Video className="w-5 h-5 text-blue-400" />}
        />
        <StatCard
          label="Processing"
          value={stats?.processing ?? 0}
          icon={<RefreshCw className="w-5 h-5 text-yellow-400" />}
        />
        <StatCard
          label="Ready for Review"
          value={stats?.ready_for_review ?? 0}
          accent
          icon={<Eye className="w-5 h-5 text-red-400" />}
        />
        <StatCard
          label="Published This Week"
          value={stats?.published_this_week ?? 0}
          icon={<CheckCircle className="w-5 h-5 text-green-400" />}
        />
      </div>

      {/* Recent Content */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent Content</h2>
          <Link href="/dashboard/content" className="text-sm text-primary hover:text-red-400">
            View all
          </Link>
        </div>

        {recentContent.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">No content yet. Drop a video in Google Drive to get started!</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {recentContent.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-center gap-4 p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="w-16 h-10 bg-muted rounded-md flex-shrink-0 overflow-hidden">
                  {item.thumbnail_url && (
                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.type}</p>
                </div>
                <StatusBadge status={item.status} />
                <div className="flex gap-1">
                  {item.platforms.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px] px-1.5">
                      {p}
                    </Badge>
                  ))}
                </div>
              </Link>
            ))}
          </Card>
        )}
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PlatformHealth />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Posting Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              { platform: "YouTube", time: "2:00 PM EST" },
              { platform: "Facebook", time: "11:00 AM EST" },
              { platform: "Instagram", time: "6:00 PM EST" },
              { platform: "TikTok", time: "7:00 PM EST" },
            ].map((s) => (
              <div key={s.platform} className="flex items-center justify-between text-muted-foreground">
                <span>{s.platform}</span>
                <span className="text-muted-foreground/60">{s.time}</span>
              </div>
            ))}
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Tip: Post short-form content (TikTok, Reels) during evening hours for maximum engagement.
                Upload new videos to Google Drive anytime — they&apos;ll be processed automatically.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Card className={accent ? "bg-red-600/10 border-red-600/30" : ""}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
