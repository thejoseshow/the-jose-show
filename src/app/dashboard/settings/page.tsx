"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Trash2, HardDrive, Clock, Zap, Scissors, Youtube, FolderOpen, Plus, X } from "lucide-react";
import type { MonitoredChannel } from "@/lib/types";

interface StorageStats {
  total_files: number;
  total_bytes: number;
  orphaned_clips: number;
  orphaned_thumbnails: number;
  orphaned_bytes: number;
}

interface Connection {
  platform: string;
  connected: boolean;
  expires_at: string | null;
  days_until_expiry: number | null;
  scopes: string[] | null;
  last_refreshed: string | null;
}

const PLATFORMS = [
  {
    id: "google",
    label: "Google",
    description: "Google Drive file sync and YouTube video uploads",
    authUrl: "/api/auth/google",
    services: "Drive + YouTube",
  },
  {
    id: "facebook",
    label: "Meta",
    description: "Facebook Page video posts and Instagram Reels",
    authUrl: "/api/auth/meta",
    services: "Facebook + Instagram",
  },
  {
    id: "tiktok",
    label: "TikTok",
    description: "TikTok video publishing",
    authUrl: "/api/auth/tiktok",
    services: "TikTok",
  },
] as const;

function OAuthToastHandler() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const platforms = ["google", "meta", "tiktok"] as const;
    for (const p of platforms) {
      const value = searchParams.get(p);
      if (value === "connected") {
        toast.success(
          `${p.charAt(0).toUpperCase() + p.slice(1)} connected successfully`
        );
      } else if (value === "error") {
        toast.error(`Failed to connect ${p}`);
      }
    }
  }, [searchParams]);

  return null;
}

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [autoApprove, setAutoApprove] = useState(false);
  const [autoApproveThreshold, setAutoApproveThreshold] = useState(7);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [optimalTimes, setOptimalTimes] = useState<Array<{ platform: string; hour: number; avgEngagement: number; sampleSize: number }>>([]);
  const [preferredTimes, setPreferredTimes] = useState<Record<string, { hour: number; minute: number }>>({
    youtube: { hour: 14, minute: 0 },
    facebook: { hour: 11, minute: 0 },
    instagram: { hour: 18, minute: 0 },
    tiktok: { hour: 19, minute: 0 },
  });
  const [abTestingEnabled, setAbTestingEnabled] = useState(false);
  const [abTestDays, setAbTestDays] = useState(3);
  const [viralityScheduling, setViralityScheduling] = useState(false);
  const [hotThreshold, setHotThreshold] = useState(80);
  const [mediumThreshold, setMediumThreshold] = useState(50);
  const [maxPostsPerDay, setMaxPostsPerDay] = useState(3);
  const [autoApproveLoading, setAutoApproveLoading] = useState(true);
  const [opusAutoSchedule, setOpusAutoSchedule] = useState(false);
  const [opusPlatforms, setOpusPlatforms] = useState<Record<string, boolean>>({
    youtube: true,
    tiktok_business: true,
    facebook_page: true,
    instagram_business: true,
    linkedin: false,
    twitter: false,
  });
  // YouTube channel monitoring
  const [monitoredChannels, setMonitoredChannels] = useState<MonitoredChannel[]>([]);
  const [channelInput, setChannelInput] = useState("");
  const [addingChannel, setAddingChannel] = useState(false);
  const [removingChannel, setRemovingChannel] = useState<string | null>(null);
  // Google Drive monitoring
  const [driveMonitorEnabled, setDriveMonitorEnabled] = useState(false);
  const [driveFolderName, setDriveFolderName] = useState("opus-clips");

  const fetchConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/connections");
      const data = await res.json();
      if (data.success) setConnections(data.data || []);
    } catch {
      toast.error("Failed to load connections");
    }
    setLoading(false);
  }, []);

  const fetchStorageStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/storage-cleanup");
      const data = await res.json();
      if (data.success) setStorageStats(data.data);
    } catch {
      // Storage stats are non-critical
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        setAutoApprove(data.data?.auto_approve_pipeline === true);
        if (data.data?.auto_approve_threshold != null) {
          setAutoApproveThreshold(Number(data.data.auto_approve_threshold));
        }
        if (data.data?.auto_schedule_enabled != null) {
          setAutoSchedule(data.data.auto_schedule_enabled === true || data.data.auto_schedule_enabled === "true");
        }
        if (data.data?.ab_testing_enabled != null) {
          setAbTestingEnabled(data.data.ab_testing_enabled === true || data.data.ab_testing_enabled === "true");
        }
        if (data.data?.ab_test_days != null) {
          setAbTestDays(parseInt(data.data.ab_test_days, 10) || 3);
        }
        if (data.data?.preferred_post_times) {
          const parsed = typeof data.data.preferred_post_times === "string"
            ? JSON.parse(data.data.preferred_post_times)
            : data.data.preferred_post_times;
          setPreferredTimes(parsed);
        }
        if (data.data?.auto_schedule_by_virality != null) {
          setViralityScheduling(data.data.auto_schedule_by_virality === true || data.data.auto_schedule_by_virality === "true");
        }
        if (data.data?.virality_hot_threshold != null) {
          setHotThreshold(Number(data.data.virality_hot_threshold) || 80);
        }
        if (data.data?.virality_medium_threshold != null) {
          setMediumThreshold(Number(data.data.virality_medium_threshold) || 50);
        }
        if (data.data?.max_posts_per_day != null) {
          setMaxPostsPerDay(Number(data.data.max_posts_per_day) || 3);
        }
        if (data.data?.opus_clip_auto_schedule != null) {
          setOpusAutoSchedule(data.data.opus_clip_auto_schedule === true || data.data.opus_clip_auto_schedule === "true");
        }
        if (data.data?.opus_clip_platforms != null) {
          const parsed = typeof data.data.opus_clip_platforms === "string"
            ? JSON.parse(data.data.opus_clip_platforms)
            : data.data.opus_clip_platforms;
          setOpusPlatforms(parsed);
        }
        if (data.data?.drive_monitor_enabled != null) {
          setDriveMonitorEnabled(data.data.drive_monitor_enabled === true || data.data.drive_monitor_enabled === "true");
        }
        if (data.data?.drive_opus_folder != null) {
          setDriveFolderName(String(data.data.drive_opus_folder) || "opus-clips");
        }
      }
    } catch {
      // Settings are non-critical
    }
    setAutoApproveLoading(false);
  }, []);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/channels");
      const data = await res.json();
      if (data.success) setMonitoredChannels(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchOptimalTimes = useCallback(async () => {
    try {
      const res = await fetch("/api/analytics/optimal-times");
      const data = await res.json();
      if (data.success) setOptimalTimes(data.data || []);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchStorageStats();
    fetchSettings();
    fetchOptimalTimes();
    fetchChannels();
  }, [fetchConnections, fetchStorageStats, fetchSettings, fetchOptimalTimes, fetchChannels]);

  async function handleDisconnect(platform: string) {
    setDisconnecting(platform);
    try {
      const res = await fetch(`/api/connections?platform=${platform}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`${platform} disconnected`);
        await fetchConnections();
      } else {
        toast.error(data.error || "Failed to disconnect");
      }
    } catch {
      toast.error("Failed to disconnect");
    }
    setDisconnecting(null);
  }

  async function handleCleanup() {
    setCleaningUp(true);
    try {
      const res = await fetch("/api/admin/storage-cleanup", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const freed = (data.freed_bytes / 1024).toFixed(1);
        toast.success(
          `Cleaned up ${data.deleted_clips} clip(s) and ${data.deleted_thumbnails} thumbnail(s) (${freed} KB freed)`
        );
        await fetchStorageStats();
      } else {
        toast.error(data.error || "Cleanup failed");
      }
    } catch {
      toast.error("Failed to clean up storage");
    }
    setCleaningUp(false);
  }

  async function handleAutoApproveToggle(checked: boolean) {
    setAutoApprove(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_approve_pipeline: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "Auto-approve enabled" : "Auto-approve disabled");
      } else {
        setAutoApprove(!checked); // revert
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setAutoApprove(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleThresholdChange(value: number) {
    setAutoApproveThreshold(value);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_approve_threshold: value }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleAutoScheduleToggle(checked: boolean) {
    setAutoSchedule(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_schedule_enabled: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "Auto-schedule enabled" : "Auto-schedule disabled");
      } else {
        setAutoSchedule(!checked);
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setAutoSchedule(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleAbTestingToggle(checked: boolean) {
    setAbTestingEnabled(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ab_testing_enabled: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "A/B testing enabled" : "A/B testing disabled");
      } else {
        setAbTestingEnabled(!checked);
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setAbTestingEnabled(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleAbTestDaysChange(value: number) {
    setAbTestDays(value);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ab_test_days: value }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handlePreferredTimeChange(platform: string, hour: number) {
    const updated = { ...preferredTimes, [platform]: { ...preferredTimes[platform], hour } };
    setPreferredTimes(updated);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferred_post_times: updated }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleViralitySchedulingToggle(checked: boolean) {
    setViralityScheduling(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_schedule_by_virality: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "Virality scheduling enabled" : "Virality scheduling disabled");
      } else {
        setViralityScheduling(!checked);
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setViralityScheduling(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleHotThresholdChange(value: number) {
    setHotThreshold(value);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ virality_hot_threshold: value }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleMediumThresholdChange(value: number) {
    setMediumThreshold(value);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ virality_medium_threshold: value }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleMaxPostsPerDayChange(value: number) {
    const clamped = Math.min(Math.max(value, 1), 10);
    setMaxPostsPerDay(clamped);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_posts_per_day: clamped }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleOpusAutoScheduleToggle(checked: boolean) {
    setOpusAutoSchedule(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opus_clip_auto_schedule: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "Opus Clip auto-scheduling enabled" : "Opus Clip auto-scheduling disabled");
      } else {
        setOpusAutoSchedule(!checked);
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setOpusAutoSchedule(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleOpusPlatformToggle(platform: string, checked: boolean) {
    const updated = { ...opusPlatforms, [platform]: checked };
    setOpusPlatforms(updated);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opus_clip_platforms: updated }),
      });
    } catch {
      // Non-critical
    }
  }

  async function handleAddChannel() {
    if (!channelInput.trim()) return;
    setAddingChannel(true);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: channelInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Now monitoring "${data.data.channel_name}"`);
        setChannelInput("");
        await fetchChannels();
      } else {
        toast.error(data.error || "Failed to add channel");
      }
    } catch {
      toast.error("Failed to add channel");
    }
    setAddingChannel(false);
  }

  async function handleRemoveChannel(id: string) {
    setRemovingChannel(id);
    try {
      const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        toast.success("Channel removed");
        await fetchChannels();
      } else {
        toast.error(data.error || "Failed to remove channel");
      }
    } catch {
      toast.error("Failed to remove channel");
    }
    setRemovingChannel(null);
  }

  async function handleChannelToggle(id: string, field: "enabled" | "auto_clip", checked: boolean) {
    // Optimistic update
    setMonitoredChannels((prev) =>
      prev.map((ch) => (ch.id === id ? { ...ch, [field]: checked } : ch))
    );
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: checked }),
      });
      const data = await res.json();
      if (!data.success) {
        // Revert
        setMonitoredChannels((prev) =>
          prev.map((ch) => (ch.id === id ? { ...ch, [field]: !checked } : ch))
        );
        toast.error(data.error || "Failed to update channel");
      }
    } catch {
      setMonitoredChannels((prev) =>
        prev.map((ch) => (ch.id === id ? { ...ch, [field]: !checked } : ch))
      );
      toast.error("Failed to update channel");
    }
  }

  async function handleDriveMonitorToggle(checked: boolean) {
    setDriveMonitorEnabled(checked);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drive_monitor_enabled: checked }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(checked ? "Drive monitoring enabled" : "Drive monitoring disabled");
      } else {
        setDriveMonitorEnabled(!checked);
        toast.error(data.error || "Failed to update setting");
      }
    } catch {
      setDriveMonitorEnabled(!checked);
      toast.error("Failed to update setting");
    }
  }

  async function handleDriveFolderChange(value: string) {
    setDriveFolderName(value);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drive_opus_folder: value }),
      });
    } catch {
      // Non-critical
    }
  }

  function getConnection(platformId: string): Connection | undefined {
    return connections.find((c) => c.platform === platformId);
  }

  return (
    <div className="space-y-6">
      <Suspense>
        <OAuthToastHandler />
      </Suspense>

      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your platform connections and account settings
        </p>
      </div>

      <Separator />

      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Platform Connections
        </h2>

        <div className="grid gap-4">
          {PLATFORMS.map((platform) => {
            const conn = getConnection(platform.id);
            const connected = conn?.connected ?? false;
            const expiring =
              conn?.days_until_expiry !== null &&
              conn?.days_until_expiry !== undefined &&
              conn.days_until_expiry < 7;

            return (
              <Card key={platform.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-base">
                        {platform.label}
                      </CardTitle>
                      {loading ? (
                        <Skeleton className="h-5 w-24" />
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            connected
                              ? expiring
                                ? "border-yellow-500/50 text-yellow-400 bg-yellow-600/10"
                                : "border-green-500/50 text-green-400 bg-green-600/10"
                              : "border-transparent text-muted-foreground bg-muted"
                          }
                        >
                          <span
                            className={`mr-1.5 inline-block w-2 h-2 rounded-full ${
                              connected
                                ? expiring
                                  ? "bg-yellow-400"
                                  : "bg-green-400"
                                : "bg-gray-600"
                            }`}
                          />
                          {connected
                            ? expiring
                              ? `Expires in ${conn.days_until_expiry}d`
                              : "Connected"
                            : "Not connected"}
                        </Badge>
                      )}
                    </div>

                    {loading ? (
                      <Skeleton className="h-9 w-24" />
                    ) : connected ? (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={disconnecting === platform.id}
                          >
                            {disconnecting === platform.id
                              ? "Disconnecting..."
                              : "Disconnect"}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Disconnect {platform.label}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove the {platform.services} connection.
                              You&apos;ll need to reconnect to publish content to{" "}
                              {platform.services}.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDisconnect(platform.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Disconnect
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : (
                      <Button size="sm" asChild>
                        <a href={platform.authUrl}>Connect</a>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">
                    {platform.description}
                  </p>
                  {connected && conn && (
                    <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {conn.scopes && conn.scopes.length > 0 && (
                        <p>
                          <span className="text-muted-foreground/70">Scopes:</span>{" "}
                          {conn.scopes.join(", ")}
                        </p>
                      )}
                      {conn.last_refreshed && (
                        <p>
                          <span className="text-muted-foreground/70">
                            Last refreshed:
                          </span>{" "}
                          {new Date(conn.last_refreshed).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      )}
                      {conn.expires_at && (
                        <p>
                          <span className="text-muted-foreground/70">
                            Expires:
                          </span>{" "}
                          {new Date(conn.expires_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                          {conn.days_until_expiry !== null &&
                            ` (${conn.days_until_expiry} days)`}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Storage */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Storage</h2>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <HardDrive className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Supabase Storage</p>
                  <p className="text-xs text-muted-foreground">
                    {storageStats
                      ? `${storageStats.total_files} file(s), ${(storageStats.total_bytes / (1024 * 1024)).toFixed(1)} MB used`
                      : "Loading..."}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={cleaningUp || !storageStats || (storageStats.orphaned_clips + storageStats.orphaned_thumbnails === 0)}
              >
                {cleaningUp ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-3 w-3" />
                    Clean Up
                  </>
                )}
              </Button>
            </div>
            {storageStats && (storageStats.orphaned_clips > 0 || storageStats.orphaned_thumbnails > 0) && (
              <p className="text-xs text-yellow-400">
                {storageStats.orphaned_clips + storageStats.orphaned_thumbnails} orphaned file(s) found ({(storageStats.orphaned_bytes / 1024).toFixed(1)} KB)
              </p>
            )}
            {storageStats && storageStats.orphaned_clips === 0 && storageStats.orphaned_thumbnails === 0 && (
              <p className="text-xs text-green-400">No orphaned files</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Automation */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Automation</h2>
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Auto-Approve Content</p>
                  <p className="text-xs text-muted-foreground">
                    Skip manual review — content goes straight to &quot;approved&quot; after processing
                  </p>
                </div>
                {autoApproveLoading ? (
                  <Skeleton className="h-5 w-10" />
                ) : (
                  <Switch checked={autoApprove} onCheckedChange={handleAutoApproveToggle} />
                )}
              </div>

              {autoApprove && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">
                        Confidence Threshold: <span className="font-bold text-white">{autoApproveThreshold}/10</span>
                      </Label>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={autoApproveThreshold}
                      onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
                      className="w-full accent-red-500"
                    />
                    <p className="text-xs text-muted-foreground">
                      Only auto-approve clips with AI score &ge; {autoApproveThreshold}. Lower scores go to review.
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Auto-Schedule</p>
                      <p className="text-xs text-muted-foreground">
                        Automatically schedule approved content at optimal posting times
                      </p>
                    </div>
                    <Switch checked={autoSchedule} onCheckedChange={handleAutoScheduleToggle} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* A/B Testing */}
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">A/B Testing</p>
                  <p className="text-xs text-muted-foreground">
                    Generate two caption/title variants per clip and compare performance
                  </p>
                </div>
                {autoApproveLoading ? (
                  <Skeleton className="h-5 w-10" />
                ) : (
                  <Switch checked={abTestingEnabled} onCheckedChange={handleAbTestingToggle} />
                )}
              </div>

              {abTestingEnabled && (
                <>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      Evaluation Period: <span className="font-bold text-white">{abTestDays} day(s)</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={14}
                      value={abTestDays}
                      onChange={(e) => handleAbTestDaysChange(parseInt(e.target.value) || 3)}
                      className="w-20 text-center"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    After this many days, the system picks a winner based on engagement.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Smart Scheduling */}
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <div>
                    <p className="text-sm font-medium">Smart Scheduling</p>
                    <p className="text-xs text-muted-foreground">
                      Auto-schedule clips by virality score from Opus Clip
                    </p>
                  </div>
                </div>
                {autoApproveLoading ? (
                  <Skeleton className="h-5 w-10" />
                ) : (
                  <Switch checked={viralityScheduling} onCheckedChange={handleViralitySchedulingToggle} />
                )}
              </div>

              {viralityScheduling && (
                <>
                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">
                        Hot Threshold: <span className="font-bold text-red-400">{hotThreshold}</span>
                      </Label>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={hotThreshold}
                      onChange={(e) => handleHotThresholdChange(parseInt(e.target.value))}
                      className="w-full accent-red-500"
                    />
                    <p className="text-xs text-muted-foreground">
                      Clips scoring {hotThreshold}+ publish within hours at the next optimal slot.
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">
                        Medium Threshold: <span className="font-bold text-yellow-400">{mediumThreshold}</span>
                      </Label>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={hotThreshold - 1}
                      step={5}
                      value={mediumThreshold}
                      onChange={(e) => handleMediumThresholdChange(parseInt(e.target.value))}
                      className="w-full accent-yellow-500"
                    />
                    <p className="text-xs text-muted-foreground">
                      Clips scoring {mediumThreshold}-{hotThreshold - 1} schedule within 1-3 days. Below {mediumThreshold} fills calendar gaps.
                    </p>
                  </div>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">Max Posts Per Day</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cap on total scheduled posts across all platforms per day
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={maxPostsPerDay}
                      onChange={(e) => handleMaxPostsPerDayChange(parseInt(e.target.value) || 3)}
                      className="w-20 text-center"
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Opus Clip Integration */}
          <Card>
            <CardContent className="pt-5 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-purple-400" />
                  <div>
                    <p className="text-sm font-medium">Opus Clip</p>
                    <p className="text-xs text-muted-foreground">
                      Auto-schedule new projects via Opus Clip API
                    </p>
                  </div>
                </div>
                {autoApproveLoading ? (
                  <Skeleton className="h-5 w-10" />
                ) : (
                  <Switch checked={opusAutoSchedule} onCheckedChange={handleOpusAutoScheduleToggle} />
                )}
              </div>

              {opusAutoSchedule && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Enable platforms for auto-scheduling:
                    </p>
                    {([
                      ["youtube", "YouTube"],
                      ["tiktok_business", "TikTok"],
                      ["facebook_page", "Facebook"],
                      ["instagram_business", "Instagram"],
                      ["linkedin", "LinkedIn"],
                      ["twitter", "Twitter"],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <Label className="text-sm text-muted-foreground">{label}</Label>
                        <Switch
                          checked={opusPlatforms[key] ?? false}
                          onCheckedChange={(checked) => handleOpusPlatformToggle(key, checked)}
                        />
                      </div>
                    ))}
                  </div>

                  <Separator />
                  <p className="text-xs text-muted-foreground">
                    API key is configured via the <code className="text-xs bg-muted px-1 py-0.5 rounded">OPUS_CLIP_API_KEY</code> environment variable.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Optimal Posting Times */}
          <Card>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                <p className="text-sm font-medium">Optimal Posting Times</p>
              </div>

              {optimalTimes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Detected from your analytics:</p>
                  {optimalTimes.map((t) => (
                    <div key={t.platform} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{t.platform}</span>
                      <span className="text-xs">
                        {t.hour > 12 ? `${t.hour - 12}:00 PM` : `${t.hour}:00 AM`} UTC
                        {t.sampleSize > 0 && (
                          <span className="text-muted-foreground/60 ml-1">({t.sampleSize} samples)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Override preferred times (UTC):</p>
                {(["youtube", "facebook", "instagram", "tiktok"] as const).map((platform) => (
                  <div key={platform} className="flex items-center justify-between">
                    <Label className="text-sm capitalize text-muted-foreground">{platform}</Label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={preferredTimes[platform]?.hour ?? 12}
                      onChange={(e) => handlePreferredTimeChange(platform, parseInt(e.target.value) || 0)}
                      className="w-20 text-center"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* YouTube Channel Monitoring */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">YouTube Channel Monitoring</h2>
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <Youtube className="w-4 h-4 text-red-500" />
              <div>
                <p className="text-sm font-medium">Monitored Channels</p>
                <p className="text-xs text-muted-foreground">
                  New videos from these channels are automatically sent to Opus Clip for clipping and scheduling
                </p>
              </div>
            </div>

            {/* Add channel input */}
            <div className="flex gap-2">
              <Input
                placeholder="YouTube URL, @handle, or channel ID"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddChannel();
                }}
                className="flex-1"
              />
              <Button
                onClick={handleAddChannel}
                disabled={addingChannel || !channelInput.trim()}
                size="sm"
              >
                {addingChannel ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </>
                )}
              </Button>
            </div>

            {/* Channel list */}
            {monitoredChannels.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                No channels being monitored yet. Add a YouTube channel above to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {monitoredChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/20"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {channel.channel_name}
                        </p>
                        <Badge
                          variant="outline"
                          className={
                            channel.enabled
                              ? "border-green-500/50 text-green-400 bg-green-600/10 text-xs"
                              : "border-transparent text-muted-foreground bg-muted text-xs"
                          }
                        >
                          {channel.enabled ? "Active" : "Paused"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {channel.channel_id}
                        {channel.last_checked_at && (
                          <span className="ml-2">
                            Last checked:{" "}
                            {new Date(channel.last_checked_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 ml-3">
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">Enabled</Label>
                        <Switch
                          checked={channel.enabled}
                          onCheckedChange={(checked) =>
                            handleChannelToggle(channel.id, "enabled", checked)
                          }
                        />
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <Label className="text-[10px] text-muted-foreground">Auto-clip</Label>
                        <Switch
                          checked={channel.auto_clip}
                          onCheckedChange={(checked) =>
                            handleChannelToggle(channel.id, "auto_clip", checked)
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveChannel(channel.id)}
                        disabled={removingChannel === channel.id}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        {removingChannel === channel.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator />
            <p className="text-xs text-muted-foreground">
              Channels are checked every 15 minutes. Requires <code className="text-xs bg-muted px-1 py-0.5 rounded">YOUTUBE_API_KEY</code> environment variable.
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* Google Drive Monitoring */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Google Drive Monitoring</h2>
        <Card>
          <CardContent className="pt-5 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-yellow-400" />
                <div>
                  <p className="text-sm font-medium">Monitor Google Drive Folder</p>
                  <p className="text-xs text-muted-foreground">
                    Videos dropped in this Drive folder are sent to Opus Clip for clipping
                  </p>
                </div>
              </div>
              {autoApproveLoading ? (
                <Skeleton className="h-5 w-10" />
              ) : (
                <Switch checked={driveMonitorEnabled} onCheckedChange={handleDriveMonitorToggle} />
              )}
            </div>

            {driveMonitorEnabled && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground">Folder name</Label>
                  <Input
                    value={driveFolderName}
                    onChange={(e) => handleDriveFolderChange(e.target.value)}
                    placeholder="opus-clips"
                    className="w-48 text-center"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The process-uploads cron will detect new files in this folder and create Opus Clip projects automatically.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
