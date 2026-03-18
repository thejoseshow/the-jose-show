"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PlatformHealth from "@/components/PlatformHealth";
import AICoachCard from "@/components/AICoachCard";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Video, RefreshCw, Eye, CheckCircle, AlertTriangle, Sparkles, Clock, Lightbulb, CalendarClock } from "lucide-react";
import type { DashboardStats, ContentListItem, Platform } from "@/lib/types";

interface PostingTime {
  platform: Platform;
  best_day: string;
  best_hour: number;
  avg_engagement: number;
  sample_size: number;
}

interface ContentIdea {
  idea: string;
  type: string;
  platforms: Platform[];
  reasoning: string;
}

interface AttentionItem {
  type: "failed_video" | "partial_publish" | "failed_content" | "expiring_token";
  id: string;
  title: string;
  detail: string;
  link: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentContent, setRecentContent] = useState<ContentListItem[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [postingTimes, setPostingTimes] = useState<PostingTime[]>([]);
  const [contentIdeas, setContentIdeas] = useState<ContentIdea[]>([]);
  const [upcomingPosts, setUpcomingPosts] = useState<ContentListItem[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, contentRes, attentionRes, upcomingRes] = await Promise.all([
          fetch("/api/content?stats=true"),
          fetch("/api/content?limit=5&sort=created_at"),
          fetch("/api/dashboard/attention"),
          fetch("/api/content?status=approved&scheduled=upcoming&limit=5"),
        ]);
        const statsData = await statsRes.json();
        const contentData = await contentRes.json();
        const attentionData = await attentionRes.json();
        const upcomingData = await upcomingRes.json();
        if (statsData.success) setStats(statsData.data);
        if (contentData.success) setRecentContent(contentData.data || []);
        if (attentionData.success) setAttentionItems(attentionData.data || []);
        if (upcomingData.success) setUpcomingPosts(upcomingData.data || []);
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Load AI suggestions separately (slower, non-blocking)
    fetch("/api/suggestions")
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPostingTimes(data.data.posting_times || []);
          setContentIdeas(data.data.content_ideas || []);
        }
      })
      .catch(() => {})
      .finally(() => setSuggestionsLoading(false));
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

      {/* Needs Attention */}
      {attentionItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold">Needs Attention</h2>
            <Badge variant="secondary" className="text-xs">{attentionItems.length}</Badge>
          </div>
          <Card className="divide-y divide-border">
            {attentionItems.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.link}
                className="flex items-center gap-4 p-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    item.type === "expiring_token"
                      ? "bg-yellow-600/20 text-yellow-400 border-transparent"
                      : "bg-red-600/20 text-red-400 border-transparent"
                  }
                >
                  {item.type === "failed_video" ? "Failed Pipeline" :
                   item.type === "partial_publish" ? "Partial Publish" :
                   item.type === "failed_content" ? "Publish Failed" :
                   "Token Expiring"}
                </Badge>
              </Link>
            ))}
          </Card>
        </div>
      )}

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
                <div className="hidden sm:flex gap-1">
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

      {/* Upcoming Scheduled Posts */}
      {upcomingPosts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Upcoming Scheduled</h2>
            <Badge variant="secondary" className="text-xs">{upcomingPosts.length}</Badge>
          </div>
          <Card className="divide-y divide-border">
            {upcomingPosts.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/content/${item.id}`}
                className="flex items-center gap-4 p-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.scheduled_at
                      ? new Date(item.scheduled_at).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "Not scheduled"}
                  </p>
                </div>
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
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <PlatformHealth />
        <AICoachCard compact />

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <CardTitle className="text-sm font-medium">AI Suggestions</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {suggestionsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Best Posting Times */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Clock className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-muted-foreground">Best Posting Times</span>
                  </div>
                  {postingTimes.map((t) => (
                    <div key={t.platform} className="flex items-center justify-between text-muted-foreground py-0.5">
                      <span className="capitalize">{t.platform}</span>
                      <span className="text-muted-foreground/60">
                        {t.best_day} {t.best_hour > 12 ? `${t.best_hour - 12}PM` : `${t.best_hour}AM`}
                        {t.sample_size > 0 && <span className="text-[10px] ml-1">({t.sample_size} posts)</span>}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Content Ideas */}
                {contentIdeas.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
                      <span className="text-xs font-medium text-muted-foreground">Content Ideas</span>
                    </div>
                    {contentIdeas.map((idea, i) => (
                      <div key={i} className="py-1.5">
                        <p className="text-xs">{idea.idea}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {idea.platforms.join(", ")} &middot; {idea.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
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
