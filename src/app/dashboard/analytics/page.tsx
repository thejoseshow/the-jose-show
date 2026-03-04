"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Video,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Trophy,
} from "lucide-react";

interface AnalyticsSummary {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_published: number;
}

interface Trends {
  views_trend: number;
  likes_trend: number;
  comments_trend: number;
  shares_trend: number;
}

interface ContentAnalytics {
  content_id: string;
  title: string;
  platforms: string[];
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  snapshots: Array<{
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    snapshot_date: string;
  }>;
}

type DateRange = "7d" | "30d" | "all";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [content, setContent] = useState<ContentAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("all");

  const loadData = useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${r}`);
      const data = await res.json();
      if (data.success) {
        setSummary(data.data.summary);
        setContent(data.data.content || []);
        setTrends(data.data.trends || null);
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData(range);
  }, [range, loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const hasData = summary && summary.total_published > 0;

  // Find top performer by views
  const topPerformer = content.length
    ? content.reduce((best, item) => (item.views > best.views ? item : best), content[0])
    : null;
  const topEngagement =
    topPerformer && topPerformer.views > 0
      ? (((topPerformer.likes + topPerformer.comments) / topPerformer.views) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          {(["7d", "30d", "all"] as DateRange[]).map((r) => (
            <Button
              key={r}
              variant={range === r ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r)}
            >
              {r === "7d" ? "7 Days" : r === "30d" ? "30 Days" : "All Time"}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard label="Published" value={summary?.total_published ?? 0} icon={<Video className="w-5 h-5 text-blue-400" />} />
        <MetricCard
          label="Total Views"
          value={summary?.total_views ?? 0}
          icon={<Eye className="w-5 h-5 text-green-400" />}
          trend={trends?.views_trend}
        />
        <MetricCard
          label="Total Likes"
          value={summary?.total_likes ?? 0}
          icon={<Heart className="w-5 h-5 text-red-400" />}
          trend={trends?.likes_trend}
        />
        <MetricCard
          label="Comments"
          value={summary?.total_comments ?? 0}
          icon={<MessageCircle className="w-5 h-5 text-yellow-400" />}
          trend={trends?.comments_trend}
        />
        <MetricCard
          label="Shares"
          value={summary?.total_shares ?? 0}
          icon={<Share2 className="w-5 h-5 text-purple-400" />}
          trend={trends?.shares_trend}
        />
      </div>

      {!hasData ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground mb-4" strokeWidth={1} />
            <p className="text-muted-foreground mb-2">No analytics data yet</p>
            <p className="text-sm text-muted-foreground/60">
              Publish content to start seeing performance metrics here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Top Performer */}
          {topPerformer && topPerformer.views > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-yellow-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-yellow-500 font-medium">Top Performing</p>
                    <Link
                      href={`/dashboard/content/${topPerformer.content_id}`}
                      className="font-medium hover:text-primary truncate block"
                    >
                      {topPerformer.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {formatNumber(topPerformer.views)} views &middot; {topEngagement}% engagement
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Platform Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Views by Platform</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {["youtube", "facebook", "instagram", "tiktok"].map((platform) => {
                const platformViews = content.reduce((sum, c) => {
                  const snap = c.snapshots.find((s) => s.platform === platform);
                  return sum + (snap?.views || 0);
                }, 0);
                const maxViews = summary?.total_views || 1;
                const pct = Math.round((platformViews / maxViews) * 100);

                const colors: Record<string, string> = {
                  youtube: "bg-red-500",
                  facebook: "bg-blue-500",
                  instagram: "bg-pink-500",
                  tiktok: "bg-cyan-500",
                };

                return (
                  <div key={platform} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 capitalize">{platform}</span>
                    <div className="flex-1 relative overflow-hidden h-6 rounded-full bg-muted">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full ${colors[platform]}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {formatNumber(platformViews)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Content Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Content Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Content</TableHead>
                    <TableHead>Platforms</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Likes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead className="text-right">Shares</TableHead>
                    <TableHead className="text-right">Eng. %</TableHead>
                    <TableHead className="text-right">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.map((item) => {
                    const eng =
                      item.views > 0
                        ? (((item.likes + item.comments) / item.views) * 100).toFixed(1)
                        : "0.0";

                    return (
                      <TableRow key={item.content_id}>
                        <TableCell>
                          <Link
                            href={`/dashboard/content/${item.content_id}`}
                            className="hover:text-primary truncate block max-w-[200px]"
                          >
                            {item.title}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.platforms.map((p) => (
                              <span
                                key={p}
                                className={`w-2 h-2 rounded-full ${
                                  {
                                    youtube: "bg-red-500",
                                    facebook: "bg-blue-500",
                                    instagram: "bg-pink-500",
                                    tiktok: "bg-cyan-500",
                                  }[p] || "bg-gray-500"
                                }`}
                                title={p}
                              />
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(item.views)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.likes)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.comments)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.shares)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{eng}%</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.published_at
                            ? new Date(item.published_at).toLocaleDateString()
                            : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  trend,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  trend?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-bold">{formatNumber(value)}</p>
        {trend !== undefined && trend !== 0 && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${trend > 0 ? "text-green-500" : "text-red-500"}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{trend > 0 ? "+" : ""}{trend}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
