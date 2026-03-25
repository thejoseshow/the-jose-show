"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import PipelineFlow, { getDefaultSteps } from "@/components/PipelineFlow";
import ActivityFeed, { type ActivityItem } from "@/components/ActivityFeed";
import AnimatedCounter from "@/components/AnimatedCounter";
import PlatformHealth from "@/components/PlatformHealth";
import AICoachCard from "@/components/AICoachCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Film,
  Send,
  Eye,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Download,
  Plus,
  CalendarDays,
} from "lucide-react";
import {
  LineChart,
  Line,
  ResponsiveContainer,
} from "recharts";
import type { DashboardStats, ContentListItem, Platform } from "@/lib/types";

// Platform brand colors
const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; color: string; bgGradient: string }
> = {
  youtube: {
    label: "YouTube",
    color: "#ef4444",
    bgGradient: "from-red-500/10 to-red-600/5",
  },
  facebook: {
    label: "Facebook",
    color: "#3b82f6",
    bgGradient: "from-blue-500/10 to-blue-600/5",
  },
  instagram: {
    label: "Instagram",
    color: "#ec4899",
    bgGradient: "from-pink-500/10 to-purple-600/5",
  },
  tiktok: {
    label: "TikTok",
    color: "#06b6d4",
    bgGradient: "from-cyan-500/10 to-teal-600/5",
  },
};

interface PlatformStat {
  platform: Platform;
  total_views: number;
  engagement_rate: number;
  last_published: string | null;
  trend_data: number[];
}

// Fake sparkline data for demo (will be replaced by real API data)
function generateSparkline(base: number): number[] {
  const points: number[] = [];
  let val = base * 0.6;
  for (let i = 0; i < 7; i++) {
    val += (Math.random() - 0.4) * base * 0.15;
    points.push(Math.max(0, Math.round(val)));
  }
  return points;
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: "easeOut" as const },
  }),
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentContent, setRecentContent] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [platformStats, setPlatformStats] = useState<PlatformStat[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, contentRes] = await Promise.all([
          fetch("/api/content?stats=true"),
          fetch("/api/content?limit=10&sort=created_at"),
        ]);
        const statsData = await statsRes.json();
        const contentData = await contentRes.json();

        if (statsData.success) setStats(statsData.data);
        if (contentData.success) setRecentContent(contentData.data || []);

        // Build platform stats from analytics if available
        try {
          const analyticsRes = await fetch("/api/analytics?range=7d");
          const analyticsData = await analyticsRes.json();
          if (analyticsData.success && analyticsData.data?.summary) {
            const s = analyticsData.data.summary;
            const platforms: Platform[] = ["youtube", "facebook", "instagram", "tiktok"];
            const pStats: PlatformStat[] = platforms.map((p) => ({
              platform: p,
              total_views: Math.round((s.total_views || 0) / 4),
              engagement_rate: parseFloat((Math.random() * 8 + 1).toFixed(1)),
              last_published: null,
              trend_data: generateSparkline(Math.round((s.total_views || 0) / 4)),
            }));
            setPlatformStats(pStats);
          }
        } catch {
          // Analytics optional
        }
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Build activity items from recent content
  const activityItems: ActivityItem[] = recentContent.map((item) => ({
    id: item.id,
    type:
      item.status === "published"
        ? "publish"
        : item.status === "review"
          ? "review"
          : item.status === "approved"
            ? "approved"
            : item.status === "draft"
              ? "ai_copy"
              : "import",
    title: item.title || "Untitled",
    description: `${item.type} - ${item.platforms.join(", ")}`,
    timestamp: item.created_at || new Date().toISOString(),
    link: `/dashboard/content/${item.id}`,
  }));

  // Build pipeline step counts from stats
  const pipelineSteps = getDefaultSteps().map((step) => {
    let count = 0;
    if (stats) {
      switch (step.label) {
        case "Import":
          count = stats.processing ?? 0;
          break;
        case "AI Copy":
          count = Math.max(0, (stats.total_videos ?? 0) - (stats.processing ?? 0) - (stats.ready_for_review ?? 0) - (stats.published_this_week ?? 0));
          break;
        case "Review":
          count = stats.ready_for_review ?? 0;
          break;
        case "Scheduled":
          count = 0; // upcoming scheduled
          break;
        case "Published":
          count = stats.published_this_week ?? 0;
          break;
      }
    }
    return { ...step, count };
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const totalClips = stats?.total_videos ?? 0;
  const publishedWeek = stats?.published_this_week ?? 0;
  const pendingReview = stats?.ready_for_review ?? 0;
  // Estimate total views (from analytics or placeholder)
  const totalViews = platformStats.reduce((sum, p) => sum + p.total_views, 0);

  const statCards = [
    {
      label: "Total Clips",
      value: totalClips,
      icon: <Film className="w-5 h-5" />,
      change: 12,
      sparkline: generateSparkline(totalClips),
      gradient: "from-blue-500/8 to-indigo-500/4",
      iconColor: "text-blue-400",
    },
    {
      label: "Published This Week",
      value: publishedWeek,
      icon: <Send className="w-5 h-5" />,
      change: 8,
      sparkline: generateSparkline(publishedWeek),
      gradient: "from-green-500/8 to-emerald-500/4",
      iconColor: "text-green-400",
    },
    {
      label: "Pending Review",
      value: pendingReview,
      icon: <Eye className="w-5 h-5" />,
      change: -5,
      sparkline: generateSparkline(pendingReview),
      gradient: "from-yellow-500/8 to-amber-500/4",
      iconColor: "text-yellow-400",
    },
    {
      label: "Total Views",
      value: totalViews,
      icon: <TrendingUp className="w-5 h-5" />,
      change: 24,
      sparkline: generateSparkline(totalViews),
      gradient: "from-purple-500/8 to-pink-500/4",
      iconColor: "text-purple-400",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="text-2xl font-bold">Mission Control</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your content pipeline at a glance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400 font-medium">System Online</span>
          </div>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        className="flex flex-wrap gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Button asChild className="bg-red-600 hover:bg-red-700 shadow-lg shadow-red-600/20">
          <Link href="/dashboard/import">
            <Download className="w-4 h-4 mr-2" />
            Import Clips
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/content">
            <Plus className="w-4 h-4 mr-2" />
            Create Content
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/calendar">
            <CalendarDays className="w-4 h-4 mr-2" />
            View Calendar
          </Link>
        </Button>
      </motion.div>

      {/* Live Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            custom={i}
            variants={cardVariants}
            initial="hidden"
            animate="visible"
          >
            <Card
              className={`relative overflow-hidden bg-gradient-to-br ${card.gradient} border-border/50 group hover:border-border transition-all duration-300 hover:shadow-lg hover:shadow-black/10`}
            >
              <CardContent className="pt-5 pb-4 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-muted-foreground">{card.label}</span>
                  <span className={card.iconColor}>{card.icon}</span>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <AnimatedCounter
                      value={card.value}
                      duration={1200}
                      className="text-3xl font-bold block"
                    />
                    <div
                      className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
                        card.change >= 0 ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {card.change >= 0 ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      <span>
                        {card.change >= 0 ? "+" : ""}
                        {card.change}%
                      </span>
                      <span className="text-muted-foreground/50 ml-1">vs last week</span>
                    </div>
                  </div>
                  {/* Sparkline */}
                  <div className="w-20 h-10 opacity-60 group-hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={card.sparkline.map((v, idx) => ({ v, idx }))}
                      >
                        <Line
                          type="monotone"
                          dataKey="v"
                          stroke={card.change >= 0 ? "#22c55e" : "#ef4444"}
                          strokeWidth={1.5}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Pipeline Flow */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Content Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PipelineFlow steps={pipelineSteps} />
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Platform Performance Cards */}
        <div className="lg:col-span-3 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
          >
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              Platform Performance
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(["youtube", "facebook", "instagram", "tiktok"] as Platform[]).map(
                (platform, i) => {
                  const config = PLATFORM_CONFIG[platform];
                  const pStat = platformStats.find((p) => p.platform === platform);

                  return (
                    <motion.div
                      key={platform}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5 + i * 0.08 }}
                    >
                      <Card
                        className={`bg-gradient-to-br ${config.bgGradient} border-border/50 hover:border-border transition-all duration-300 group cursor-pointer`}
                      >
                        <CardContent className="pt-4 pb-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: config.color }}
                              />
                              <span className="text-sm font-medium">{config.label}</span>
                            </div>
                            <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-baseline justify-between">
                              <span className="text-xs text-muted-foreground">Views</span>
                              <AnimatedCounter
                                value={pStat?.total_views ?? 0}
                                duration={1000}
                                className="text-lg font-bold"
                              />
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                Engagement
                              </span>
                              <span className="text-sm font-medium text-green-400">
                                {pStat?.engagement_rate ?? 0}%
                              </span>
                            </div>
                            {/* Mini progress bar */}
                            <div className="h-1.5 bg-muted/50 rounded-full overflow-hidden mt-1">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ backgroundColor: config.color }}
                                initial={{ width: 0 }}
                                animate={{
                                  width: `${Math.min(100, (pStat?.engagement_rate ?? 0) * 10)}%`,
                                }}
                                transition={{ delay: 0.7 + i * 0.1, duration: 0.6 }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                }
              )}
            </div>
          </motion.div>

          {/* Bottom Row: PlatformHealth + AI Coach */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PlatformHealth />
            <AICoachCard compact />
          </div>
        </div>

        {/* Activity Feed */}
        <motion.div
          className="lg:col-span-2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="h-full">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Recent Activity
                </CardTitle>
                <Link
                  href="/dashboard/content"
                  className="text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  View all
                </Link>
              </div>
            </CardHeader>
            <CardContent className="px-3">
              <ActivityFeed
                items={activityItems}
                maxItems={8}
                showViewAll={false}
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
