"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AICoachCard from "@/components/AICoachCard";
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
  Users,
  Clock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsSummary {
  total_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_reach: number;
  total_watch_time: number;
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

interface TimeseriesPoint {
  date: string;
  youtube: number;
  facebook: number;
  instagram: number;
  tiktok: number;
  total: number;
}

interface EngagementPoint {
  date: string;
  rate: number;
}

interface ContentTimeseriesPoint {
  date: string;
  views: number;
  likes: number;
}

type DateRange = "7d" | "30d" | "all";

const PLATFORM_COLORS = {
  youtube: "#ef4444",
  facebook: "#3b82f6",
  instagram: "#ec4899",
  tiktok: "#06b6d4",
} as const;

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [trends, setTrends] = useState<Trends | null>(null);
  const [content, setContent] = useState<ContentAnalytics[]>([]);
  const [timeseries, setTimeseries] = useState<TimeseriesPoint[]>([]);
  const [engagement, setEngagement] = useState<EngagementPoint[]>([]);
  const [contentTimeseries, setContentTimeseries] = useState<Record<string, ContentTimeseriesPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>("30d");

  const loadData = useCallback(async (r: DateRange) => {
    setLoading(true);
    try {
      const [mainRes, tsRes] = await Promise.all([
        fetch(`/api/analytics?range=${r}`),
        fetch(`/api/analytics?timeseries=true&range=${r}`),
      ]);
      const mainData = await mainRes.json();
      const tsData = await tsRes.json();

      if (mainData.success) {
        setSummary(mainData.data.summary);
        setContent(mainData.data.content || []);
        setTrends(mainData.data.trends || null);
      }
      if (tsData.success) {
        setTimeseries(tsData.data.timeseries || []);
        setEngagement(tsData.data.engagement || []);
        setContentTimeseries(tsData.data.content_timeseries || {});
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
        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
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
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
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
        <MetricCard
          label="Reach"
          value={summary?.total_reach ?? 0}
          icon={<Users className="w-5 h-5 text-cyan-400" />}
        />
        <MetricCard
          label="Est. Watch Time"
          value={Math.round((summary?.total_watch_time ?? 0) / 3600)}
          icon={<Clock className="w-5 h-5 text-orange-400" />}
          suffix="hrs"
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

          {/* Views by Platform — Stacked Area Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Views by Platform</CardTitle>
            </CardHeader>
            <CardContent>
              {timeseries.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={timeseries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={formatDateShort}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={formatNumber}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip content={<PlatformTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="youtube"
                      stackId="1"
                      stroke={PLATFORM_COLORS.youtube}
                      fill={PLATFORM_COLORS.youtube}
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="facebook"
                      stackId="1"
                      stroke={PLATFORM_COLORS.facebook}
                      fill={PLATFORM_COLORS.facebook}
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="instagram"
                      stackId="1"
                      stroke={PLATFORM_COLORS.instagram}
                      fill={PLATFORM_COLORS.instagram}
                      fillOpacity={0.6}
                    />
                    <Area
                      type="monotone"
                      dataKey="tiktok"
                      stackId="1"
                      stroke={PLATFORM_COLORS.tiktok}
                      fill={PLATFORM_COLORS.tiktok}
                      fillOpacity={0.6}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No timeseries data for this range</p>
              )}
              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-3">
                {Object.entries(PLATFORM_COLORS).map(([platform, color]) => (
                  <div key={platform} className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs text-muted-foreground capitalize">{platform}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Engagement Over Time — Line Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Engagement Rate Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {engagement.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={engagement}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12 }}
                      tickFormatter={formatDateShort}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) => `${v}%`}
                      stroke="hsl(var(--muted-foreground))"
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, "Engagement"]}
                      labelFormatter={(label) => formatDateShort(String(label))}
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      stroke="#22c55e"
                      fill="#22c55e"
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No engagement data for this range</p>
              )}
            </CardContent>
          </Card>

          {/* AI Coach */}
          <AICoachCard />

          {/* Content Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle>Content Performance</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
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
                    <TableHead className="text-center">Trend</TableHead>
                    <TableHead className="text-right">Published</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {content.map((item) => {
                    const eng =
                      item.views > 0
                        ? (((item.likes + item.comments) / item.views) * 100).toFixed(1)
                        : "0.0";
                    const sparkData = contentTimeseries[item.content_id];

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
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: PLATFORM_COLORS[p as keyof typeof PLATFORM_COLORS] || "#6b7280" }}
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
                        <TableCell className="text-center">
                          <Sparkline data={sparkData} />
                        </TableCell>
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

function Sparkline({ data }: { data?: ContentTimeseriesPoint[] }) {
  if (!data || data.length < 2) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  return (
    <div className="w-20 h-6 inline-block">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="views"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlatformTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload) return null;

  const total = payload.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-md text-sm">
      <p className="font-medium mb-1.5">{label ? formatDateShort(label) : ""}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
            <span className="capitalize text-muted-foreground">{p.dataKey}</span>
          </div>
          <span className="font-medium">{formatNumber(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1.5 pt-1.5 flex justify-between">
        <span className="text-muted-foreground">Total</span>
        <span className="font-medium">{formatNumber(total)}</span>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  trend,
  suffix,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  trend?: number;
  suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-bold">
          {formatNumber(value)}
          {suffix && <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>}
        </p>
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

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
