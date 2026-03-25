"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Play,
  Trash2,
  Zap,
  Users,
  Plus,
  ExternalLink,
  BarChart3,
} from "lucide-react";

// --- Types ---

interface OpusProject {
  id: string;
  name: string;
  clipCount: number;
  createdAt: string;
  autoScheduled: boolean;
  error?: string;
}

interface OpusClip {
  id: string;
  title: string;
  description: string;
  durationMs: number;
  viralityRank: number;
  uriForPreview: string;
}

interface ScheduledPostEntry {
  clipId: string;
  clipTitle: string;
  platform: string;
  accountName: string;
  scheduledAt: string;
  viralityRank: number;
  viralityTier: "hot" | "medium" | "filler";
  scheduleId?: string;
}

interface ScheduleData {
  projectId: string;
  totalClips: number;
  totalScheduled: number;
  posts: ScheduledPostEntry[];
  errors: string[];
  scheduledAt: string;
}

interface SocialAccount {
  postAccountId: string;
  subAccountId?: string;
  platform: string;
  extUserId: string;
  extUserName: string;
  extUserPictureLink?: string;
  extUserProfileLink?: string;
}

// --- Constants ---

const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "bg-red-600 text-white",
  TIKTOK_BUSINESS: "bg-black text-white border border-white/20",
  FACEBOOK_PAGE: "bg-blue-600 text-white",
  INSTAGRAM_BUSINESS: "bg-gradient-to-r from-purple-600 to-pink-600 text-white",
  LINKEDIN: "bg-blue-700 text-white",
  TWITTER: "bg-sky-500 text-white",
  youtube: "bg-red-600 text-white",
  tiktok_business: "bg-black text-white border border-white/20",
  facebook_page: "bg-blue-600 text-white",
  instagram_business: "bg-gradient-to-r from-purple-600 to-pink-600 text-white",
  linkedin: "bg-blue-700 text-white",
  twitter: "bg-sky-500 text-white",
};

const TIER_STYLES: Record<string, { label: string; className: string }> = {
  hot: { label: "HOT", className: "bg-red-600 text-white" },
  medium: { label: "MEDIUM", className: "bg-yellow-600 text-white" },
  filler: { label: "FILLER", className: "bg-gray-600 text-white" },
};

function formatPlatformName(platform: string): string {
  const map: Record<string, string> = {
    YOUTUBE: "YouTube",
    TIKTOK_BUSINESS: "TikTok",
    FACEBOOK_PAGE: "Facebook",
    INSTAGRAM_BUSINESS: "Instagram",
    LINKEDIN: "LinkedIn",
    TWITTER: "Twitter",
    youtube: "YouTube",
    tiktok_business: "TikTok",
    facebook_page: "Facebook",
    instagram_business: "Instagram",
    linkedin: "LinkedIn",
    twitter: "Twitter",
  };
  return map[platform] || platform;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}:${String(rem).padStart(2, "0")}` : `${s}s`;
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
  const [projects, setProjects] = useState<OpusProject[]>([]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [schedules, setSchedules] = useState<ScheduleData[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [projectClips, setProjectClips] = useState<Record<string, OpusClip[]>>(
    {}
  );
  const [loadingClips, setLoadingClips] = useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [newProjectId, setNewProjectId] = useState("");
  const [addingProject, setAddingProject] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

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

  const fetchAccounts = useCallback(async () => {
    try {
      const res = await fetch("/api/opus-clip/accounts");
      const data = await res.json();
      if (data.success) setAccounts(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch("/api/opus-clip/schedule");
      const data = await res.json();
      if (data.success) setSchedules(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchProjects(), fetchAccounts(), fetchSchedules()]).then(() =>
      setLoading(false)
    );
  }, [fetchProjects, fetchAccounts, fetchSchedules]);

  // --- Actions ---

  async function handleAutoSchedule(projectId: string) {
    setScheduling(projectId);
    try {
      const res = await fetch("/api/opus-clip/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(
          `Scheduled ${data.data.totalScheduled} posts across ${data.data.totalClips} clips`
        );
        await Promise.all([fetchProjects(), fetchSchedules()]);
      } else {
        toast.error(data.error || "Auto-schedule failed");
      }
    } catch {
      toast.error("Failed to auto-schedule project");
    }
    setScheduling(null);
  }

  async function handleViewClips(projectId: string) {
    if (expandedProject === projectId) {
      setExpandedProject(null);
      return;
    }

    setExpandedProject(projectId);

    if (projectClips[projectId]) return;

    setLoadingClips(projectId);
    try {
      // Fetch clips via the projects endpoint (clips are embedded in getProjectClips)
      const res = await fetch(
        `/api/opus-clip/schedule?projectId=${projectId}`
      );
      const data = await res.json();
      if (data.success && data.data?.posts) {
        // Use schedule data to show clips
      }
    } catch {
      // Non-critical
    }
    setLoadingClips(null);
  }

  async function handleAddProject() {
    if (!newProjectId.trim()) return;

    setAddingProject(true);
    try {
      const res = await fetch("/api/opus-clip/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: newProjectId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Project added");
        setNewProjectId("");
        await fetchProjects();
      } else {
        toast.error(data.error || "Failed to add project");
      }
    } catch {
      toast.error("Failed to add project");
    }
    setAddingProject(false);
  }

  async function handleCancelSchedule(scheduleId: string) {
    setCancelling(scheduleId);
    try {
      const res = await fetch(
        `/api/opus-clip/schedule?scheduleId=${scheduleId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (data.success) {
        toast.success("Post cancelled");
        await fetchSchedules();
      } else {
        toast.error(data.error || "Failed to cancel");
      }
    } catch {
      toast.error("Failed to cancel post");
    }
    setCancelling(null);
  }

  // --- Computed Stats ---

  const allPosts = schedules.flatMap((s) => s.posts || []);
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const postsThisWeek = allPosts.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d >= now && d <= weekFromNow;
  }).length;

  const postsThisMonth = allPosts.filter((p) => {
    const d = new Date(p.scheduledAt);
    return d >= now && d <= monthFromNow;
  }).length;

  const futurePosts = allPosts
    .filter((p) => new Date(p.scheduledAt) > now)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    );

  const nextPost = futurePosts[0];

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
            Auto-schedule Opus Clip projects across all platforms
          </p>
        </div>
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
                      Next: {nextPost.clipTitle}
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

      {/* Add Project */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Paste Opus Clip project ID..."
                value={newProjectId}
                onChange={(e) => setNewProjectId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddProject()}
                className="flex-1"
              />
              <Button
                onClick={handleAddProject}
                disabled={addingProject || !newProjectId.trim()}
                className="gap-2"
              >
                {addingProject ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add Project
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Projects List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <h2 className="text-lg font-semibold mb-3">Your Opus Clip Projects</h2>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-2">
                No projects yet.
              </p>
              <p className="text-sm text-muted-foreground/60">
                Add an Opus Clip project ID above to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="group">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm truncate">
                              {project.name}
                            </h3>
                            {project.autoScheduled && (
                              <Badge
                                variant="outline"
                                className="border-green-500/50 text-green-400 bg-green-600/10 text-[10px]"
                              >
                                Scheduled
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {project.clipCount} clip
                            {project.clipCount !== 1 ? "s" : ""} &middot;{" "}
                            {new Date(project.createdAt).toLocaleDateString()}
                          </p>
                          {project.error && (
                            <p className="text-xs text-destructive mt-1">
                              {project.error}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleViewClips(project.id)}
                            className="text-xs gap-1"
                          >
                            {expandedProject === project.id ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                            Clips
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleAutoSchedule(project.id)}
                            disabled={
                              scheduling === project.id ||
                              project.clipCount === 0
                            }
                            className="gap-1"
                          >
                            {scheduling === project.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            {project.autoScheduled
                              ? "Re-Schedule"
                              : "Auto-Schedule"}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded clips view */}
                      <AnimatePresence>
                        {expandedProject === project.id && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <Separator className="my-3" />
                            {loadingClips === project.id ? (
                              <div className="flex items-center gap-2 py-4 justify-center">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span className="text-sm text-muted-foreground">
                                  Loading clips...
                                </span>
                              </div>
                            ) : (
                              <ScheduleView
                                projectId={project.id}
                                schedules={schedules}
                                onCancel={handleCancelSchedule}
                                cancelling={cancelling}
                              />
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Schedule Timeline */}
      {futurePosts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-lg font-semibold mb-3">Upcoming Schedule</h2>
          <Card>
            <CardContent className="py-4">
              <div className="space-y-2">
                {futurePosts.slice(0, 20).map((post, i) => {
                  const tierStyle = TIER_STYLES[post.viralityTier] || TIER_STYLES.filler;
                  const platformColor =
                    PLATFORM_COLORS[post.platform] || "bg-gray-600 text-white";

                  return (
                    <div
                      key={`${post.clipId}-${post.platform}-${i}`}
                      className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="w-24 text-xs text-muted-foreground shrink-0">
                        {formatScheduleTime(post.scheduledAt)}
                      </div>
                      <Badge
                        variant="outline"
                        className={`${platformColor} text-[10px] shrink-0`}
                      >
                        {formatPlatformName(post.platform)}
                      </Badge>
                      <span className="text-sm truncate flex-1">
                        {post.clipTitle}
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
                      {post.scheduleId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            post.scheduleId &&
                            handleCancelSchedule(post.scheduleId)
                          }
                          disabled={cancelling === post.scheduleId}
                          className="shrink-0 h-7 w-7 p-0"
                        >
                          {cancelling === post.scheduleId ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })}
                {futurePosts.length > 20 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    + {futurePosts.length - 20} more scheduled posts
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Connected Accounts (collapsible) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <button
          onClick={() => setAccountsOpen(!accountsOpen)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {accountsOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          <Users className="w-4 h-4" />
          Connected Accounts
          <Badge variant="secondary" className="text-[10px] ml-1">
            {accounts.length}
          </Badge>
        </button>

        <AnimatePresence>
          {accountsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <Card className="mt-3">
                <CardContent className="py-4">
                  {accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No social accounts connected in Opus Clip. Connect
                      accounts in your Opus Clip dashboard.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {accounts.map((account) => {
                        const platformColor =
                          PLATFORM_COLORS[account.platform] ||
                          "bg-gray-600 text-white";

                        return (
                          <div
                            key={account.postAccountId}
                            className="flex items-center gap-3"
                          >
                            <Badge
                              variant="outline"
                              className={`${platformColor} text-xs shrink-0`}
                            >
                              {formatPlatformName(account.platform)}
                            </Badge>
                            <span className="text-sm">
                              {account.extUserName}
                            </span>
                            {account.extUserProfileLink && (
                              <a
                                href={account.extUserProfileLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

// --- Sub-component: Schedule View for a project ---

function ScheduleView({
  projectId,
  schedules,
  onCancel,
  cancelling,
}: {
  projectId: string;
  schedules: ScheduleData[];
  onCancel: (scheduleId: string) => void;
  cancelling: string | null;
}) {
  const schedule = schedules.find((s) => s.projectId === projectId);

  if (!schedule || !schedule.posts || schedule.posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No schedule data yet. Click &quot;Auto-Schedule&quot; to distribute clips.
      </p>
    );
  }

  // Group posts by clip
  const clipGroups: Record<
    string,
    { title: string; rank: number; tier: string; posts: ScheduledPostEntry[] }
  > = {};

  for (const post of schedule.posts) {
    if (!clipGroups[post.clipId]) {
      clipGroups[post.clipId] = {
        title: post.clipTitle,
        rank: post.viralityRank,
        tier: post.viralityTier,
        posts: [],
      };
    }
    clipGroups[post.clipId].posts.push(post);
  }

  return (
    <div className="space-y-3">
      {Object.entries(clipGroups).map(([clipId, group]) => {
        const tierStyle = TIER_STYLES[group.tier] || TIER_STYLES.filler;

        return (
          <div key={clipId} className="bg-accent/30 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <Play className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm font-medium truncate flex-1">
                {group.title}
              </span>
              <Badge
                variant="outline"
                className={`${tierStyle.className} text-[10px]`}
              >
                {tierStyle.label} ({group.rank})
              </Badge>
            </div>
            <div className="space-y-1 ml-5">
              {group.posts.map((post, i) => {
                const platformColor =
                  PLATFORM_COLORS[post.platform] || "bg-gray-600 text-white";

                return (
                  <div
                    key={`${post.platform}-${i}`}
                    className="flex items-center gap-2 text-xs"
                  >
                    <Badge
                      variant="outline"
                      className={`${platformColor} text-[9px] px-1.5 py-0`}
                    >
                      {formatPlatformName(post.platform)}
                    </Badge>
                    <span className="text-muted-foreground">
                      {formatScheduleTime(post.scheduledAt)}
                    </span>
                    <span className="text-muted-foreground/60">
                      ({getTimeUntil(post.scheduledAt)})
                    </span>
                    {post.scheduleId && (
                      <button
                        onClick={() =>
                          post.scheduleId && onCancel(post.scheduleId)
                        }
                        disabled={cancelling === post.scheduleId}
                        className="ml-auto text-muted-foreground hover:text-destructive"
                      >
                        {cancelling === post.scheduleId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {schedule.errors.length > 0 && (
        <div className="bg-destructive/10 rounded-lg p-3">
          <p className="text-xs font-medium text-destructive mb-1">Errors:</p>
          {schedule.errors.map((err, i) => (
            <p key={i} className="text-xs text-destructive/80">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
