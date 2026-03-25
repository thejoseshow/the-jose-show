"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CalendarDays,
  Clock,
  Loader2,
  Zap,
  Send,
  BarChart3,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Hourglass,
} from "lucide-react";

// --- Types ---

interface Project {
  id: string;
  name: string;
  videoUrl: string;
  clipCount: number;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: string;
  completedAt?: string;
  autoScheduled: boolean;
  error?: string;
}

interface ScheduledPost {
  contentId: string;
  title: string;
  platforms: string[];
  scheduledAt: string;
  status: string;
  viralityRank: number;
  viralityTier: "hot" | "medium" | "filler";
}

// --- Constants ---

const PLATFORM_COLORS: Record<string, string> = {
  youtube: "bg-red-600 text-white",
  facebook: "bg-blue-600 text-white",
  instagram: "bg-gradient-to-r from-purple-600 to-pink-600 text-white",
  tiktok: "bg-black text-white border border-white/20",
};

const TIER_STYLES: Record<string, { label: string; className: string }> = {
  hot: { label: "HOT", className: "bg-red-600 text-white" },
  medium: { label: "MEDIUM", className: "bg-yellow-600 text-white" },
  filler: { label: "FILLER", className: "bg-gray-600 text-white" },
};

const STATUS_ICONS: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  pending: { icon: Hourglass, className: "text-yellow-400" },
  processing: { icon: Loader2, className: "text-blue-400 animate-spin" },
  completed: { icon: CheckCircle2, className: "text-green-400" },
  failed: { icon: AlertCircle, className: "text-red-400" },
};

function formatPlatformName(platform: string): string {
  const map: Record<string, string> = {
    youtube: "YouTube",
    facebook: "Facebook",
    instagram: "Instagram",
    tiktok: "TikTok",
  };
  return map[platform] || platform;
}

function formatScheduleTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTimeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "Past";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 48) return `${Math.floor(hours / 24)}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// --- Component ---

export default function SchedulePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // --- Data Fetching ---

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/opus-clip/projects");
      const data = await res.json();
      if (data.success) setProjects(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch("/api/opus-clip/schedule");
      const data = await res.json();
      if (data.success) setScheduledPosts(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchProjects(), fetchSchedule()]);
    setRefreshing(false);
  }, [fetchProjects, fetchSchedule]);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchSchedule()]).then(() =>
      setLoading(false)
    );
  }, [fetchProjects, fetchSchedule]);

  // --- Actions ---

  async function handleSendToOpusClip() {
    if (!videoUrl.trim()) return;

    setSending(true);
    try {
      const res = await fetch("/api/opus-clip/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: videoUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Video sent to Opus Clip for clipping");
        setVideoUrl("");
        await fetchProjects();
      } else {
        toast.error(data.error || "Failed to send video");
      }
    } catch {
      toast.error("Failed to send video to Opus Clip");
    }
    setSending(false);
  }

  async function handleUnschedule(contentId: string) {
    try {
      const res = await fetch(
        `/api/opus-clip/schedule?contentId=${contentId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Post unscheduled");
        await fetchSchedule();
      } else {
        toast.error(data.error || "Failed to unschedule");
      }
    } catch {
      toast.error("Failed to unschedule post");
    }
  }

  // --- Computed Stats ---

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const postsThisWeek = scheduledPosts.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d >= now && d <= weekFromNow;
  }).length;

  const postsThisMonth = scheduledPosts.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d >= now && d <= monthFromNow;
  }).length;

  const pendingProjects = projects.filter((p) => p.status === "pending" || p.status === "processing");
  const completedProjects = projects.filter((p) => p.status === "completed");
  const failedProjects = projects.filter((p) => p.status === "failed");

  const nextPost = scheduledPosts[0]; // Already sorted by scheduledAt ascending

  // --- Loading State ---

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        className="flex items-center justify-between"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Send videos to Opus Clip, import clips, auto-schedule across platforms
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshAll}
          disabled={refreshing}
          className="gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </motion.div>

      {/* Quick Stats */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <CalendarDays className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-2xl font-bold">{postsThisWeek}</p>
                <p className="text-xs text-muted-foreground">This week</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-2xl font-bold">{postsThisMonth}</p>
                <p className="text-xs text-muted-foreground">This month</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400" />
              <div>
                {nextPost ? (
                  <>
                    <p className="text-2xl font-bold">
                      {getTimeUntil(nextPost.scheduledAt)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                      Next: {nextPost.title}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold">--</p>
                    <p className="text-xs text-muted-foreground">
                      No upcoming posts
                    </p>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Send to Opus Clip */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium">Send to Opus Clip</span>
            </div>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Paste a YouTube URL or video link..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendToOpusClip()}
                className="flex-1"
              />
              <Button
                onClick={handleSendToOpusClip}
                disabled={sending || !videoUrl.trim()}
                className="gap-2"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Video will be sent to Opus Clip via Zapier. Clips will appear here once processing completes.
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Pending in Opus Clip */}
      {pendingProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-lg font-semibold mb-3">Pending in Opus Clip</h2>
          <div className="space-y-2">
            {pendingProjects.map((project) => {
              const statusInfo = STATUS_ICONS[project.status] || STATUS_ICONS.pending;
              const StatusIcon = statusInfo.icon;

              return (
                <Card key={project.id}>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={`w-4 h-4 shrink-0 ${statusInfo.className}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{project.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Sent {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">
                        {project.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Failed Projects */}
      {failedProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
        >
          <h2 className="text-lg font-semibold mb-3 text-red-400">Failed</h2>
          <div className="space-y-2">
            {failedProjects.slice(0, 5).map((project) => (
              <Card key={project.id} className="border-red-600/30">
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      {project.error && (
                        <p className="text-xs text-red-400 truncate">{project.error}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Completed Projects */}
      {completedProjects.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
        >
          <h2 className="text-lg font-semibold mb-3">Imported</h2>
          <div className="space-y-2">
            {completedProjects.slice(0, 10).map((project) => (
              <Card key={project.id}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-green-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{project.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {project.clipCount} clip{project.clipCount !== 1 ? "s" : ""} imported
                        {project.completedAt && (
                          <> &middot; {new Date(project.completedAt).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    {project.autoScheduled && (
                      <Badge
                        variant="outline"
                        className="border-green-500/50 text-green-400 bg-green-600/10 text-[10px]"
                      >
                        Scheduled
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {projects.length === 0 && scheduledPosts.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-2">
                No clips yet.
              </p>
              <p className="text-sm text-muted-foreground/60">
                Paste a YouTube URL above to send it to Opus Clip, or set up
                YouTube channel monitoring in Settings.
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Schedule Timeline */}
      {scheduledPosts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold mb-3">Upcoming Schedule</h2>
          <Card>
            <CardContent className="py-4">
              <div className="space-y-2">
                {scheduledPosts.slice(0, 20).map((post, i) => {
                  const tierStyle = TIER_STYLES[post.viralityTier] || TIER_STYLES.filler;

                  return (
                    <div
                      key={`${post.contentId}-${i}`}
                      className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="w-24 text-xs text-muted-foreground shrink-0">
                        {formatScheduleTime(post.scheduledAt)}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {post.platforms.map((platform) => (
                          <Badge
                            key={platform}
                            variant="outline"
                            className={`${PLATFORM_COLORS[platform] || "bg-gray-600 text-white"} text-[10px]`}
                          >
                            {formatPlatformName(platform)}
                          </Badge>
                        ))}
                      </div>
                      <span className="text-sm truncate flex-1">
                        {post.title}
                      </span>
                      <Badge
                        variant="outline"
                        className={`${tierStyle.className} text-[10px] shrink-0`}
                      >
                        {tierStyle.label}
                      </Badge>
                      <span className="text-xs text-muted-foreground shrink-0 w-14 text-right">
                        {getTimeUntil(post.scheduledAt)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUnschedule(post.contentId)}
                        className="shrink-0 h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  );
                })}
                {scheduledPosts.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {scheduledPosts.length - 20} more scheduled posts
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
