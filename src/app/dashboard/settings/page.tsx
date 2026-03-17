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
import { Loader2, Trash2, HardDrive, Clock } from "lucide-react";

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
  const [autoApproveLoading, setAutoApproveLoading] = useState(true);

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
        if (data.data?.preferred_post_times) {
          const parsed = typeof data.data.preferred_post_times === "string"
            ? JSON.parse(data.data.preferred_post_times)
            : data.data.preferred_post_times;
          setPreferredTimes(parsed);
        }
      }
    } catch {
      // Settings are non-critical
    }
    setAutoApproveLoading(false);
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
  }, [fetchConnections, fetchStorageStats, fetchSettings, fetchOptimalTimes]);

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
    </div>
  );
}
