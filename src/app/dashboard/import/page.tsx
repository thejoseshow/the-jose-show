"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CloudUpload,
  FolderSync,
  Camera,
  Loader2,
  Play,
  RotateCcw,
  Trash2,
  Sparkles,
  Eye,
  ChevronDown,
  ChevronUp,
  HardDrive,
  FileVideo,
  Plus,
} from "lucide-react";
import { LONG_FORM_THRESHOLD_SECONDS } from "@/lib/constants";
import type { Video } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  new: "bg-gray-600 text-white border-transparent",
  downloading: "bg-blue-600 text-white border-transparent animate-pulse",
  downloaded: "bg-blue-500 text-white border-transparent",
  transcribing: "bg-yellow-600 text-white border-transparent animate-pulse",
  transcribed: "bg-yellow-500 text-white border-transparent",
  clipping: "bg-purple-600 text-white border-transparent animate-pulse",
  clipped: "bg-green-500 text-white border-transparent",
  failed: "bg-red-500 text-white border-transparent",
};

const STATUS_ORDER_VIDEO = [
  "new",
  "downloading",
  "downloaded",
  "transcribing",
  "transcribed",
  "clipping",
  "clipped",
];

const STATUS_ORDER_PHOTO = [
  "new",
  "downloading",
  "downloaded",
  "clipping",
  "clipped",
];

export default function ImportPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [sourceVideosOpen, setSourceVideosOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadVideos = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/status");
      const data = await res.json();
      if (data.success) setVideos(data.data || []);
    } catch (err) {
      console.error("Failed to load videos:", err);
    }
  }, []);

  useEffect(() => {
    loadVideos().then(() => setLoading(false));
    const interval = setInterval(loadVideos, 15000);
    return () => clearInterval(interval);
  }, [loadVideos]);

  async function handleProcessNow() {
    setProcessing(true);
    setProcessResult(null);
    try {
      const res = await fetch("/api/pipeline/process", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const parts: string[] = [];
        if (data.new_files_detected > 0) parts.push(`${data.new_files_detected} new file(s) found`);
        if (data.processed > 0) parts.push(`${data.processed} video(s) processed`);
        if (data.errors?.length) parts.push(`${data.errors.length} error(s)`);
        setProcessResult(parts.length > 0 ? parts.join(", ") : "No new files to process");
      } else {
        setProcessResult(data.error || "Processing failed");
      }
      await loadVideos();
    } catch (err) {
      setProcessResult(`Failed: ${err instanceof Error ? err.message : "Network error"}`);
    }
    setProcessing(false);
  }

  async function handleReprocess(videoId: string) {
    setReprocessing(videoId);
    try {
      const res = await fetch("/api/pipeline/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const data = await res.json();
      if (data.success) {
        setProcessResult("Reprocessing started");
      } else {
        setProcessResult(data.error || "Reprocess failed");
      }
      await loadVideos();
    } catch {
      setProcessResult("Failed to reprocess video");
    }
    setReprocessing(null);
  }

  async function handleRetry(videoId: string) {
    setRetrying(videoId);
    try {
      const res = await fetch("/api/pipeline/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId }),
      });
      const data = await res.json();
      if (data.success) {
        setProcessResult(`Reset to "${data.reset_to}" — ready for reprocessing`);
      } else {
        setProcessResult(data.error || "Retry failed");
      }
      await loadVideos();
    } catch {
      setProcessResult("Failed to retry video");
    }
    setRetrying(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    // Future: handle file upload
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setProcessResult(`${files.length} file(s) selected. Direct upload coming soon. Use Google Drive for now.`);
    }
  }

  const activeCount = videos.filter(
    (v) => !["clipped", "failed"].includes(v.status)
  ).length;
  const failedCount = videos.filter((v) => v.status === "failed").length;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 rounded-xl" />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
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
          <h1 className="text-2xl font-bold">Import</h1>
          <p className="text-sm text-muted-foreground">
            Bring in clips from Google Drive or upload directly
          </p>
        </div>
        <div className="flex items-center gap-3">
          {processResult && (
            <motion.span
              className="text-sm text-muted-foreground max-w-xs truncate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {processResult}
            </motion.span>
          )}
          {activeCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeCount} processing
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {failedCount} failed
            </Badge>
          )}
        </div>
      </motion.div>

      {/* Import Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? "border-red-500 bg-red-500/10 scale-[1.01]"
              : "border-border hover:border-muted-foreground/40 hover:bg-accent/30"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            multiple
            className="hidden"
            onChange={() => {
              setProcessResult("Direct upload coming soon. Use Google Drive for now.");
            }}
          />

          <motion.div
            animate={isDragging ? { scale: 1.1, y: -4 } : { scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <CloudUpload
              className={`w-12 h-12 mx-auto mb-4 transition-colors ${
                isDragging ? "text-red-400" : "text-muted-foreground/50"
              }`}
            />
          </motion.div>

          <p className="text-lg font-medium mb-1">
            {isDragging ? "Drop to import" : "Drop clips here or click to upload"}
          </p>
          <p className="text-sm text-muted-foreground">
            Supports MP4, MOV, WebM
          </p>

          {/* Animated border pulse when dragging */}
          {isDragging && (
            <motion.div
              className="absolute inset-0 rounded-2xl border-2 border-red-500/50"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>

        {/* Drive scan button */}
        <div className="flex items-center justify-center gap-4 mt-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex items-center justify-center gap-3 mt-4">
          <Button
            onClick={handleProcessNow}
            disabled={processing}
            variant="outline"
            className="gap-2"
          >
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <FolderSync className="h-4 w-4" />
                Scan Google Drive
              </>
            )}
          </Button>
          <span className="text-xs text-muted-foreground">
            <HardDrive className="w-3 h-3 inline mr-1" />
            Auto-scans every 15 min
          </span>
        </div>
      </motion.div>

      {/* Import Queue */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Import Queue</h2>
          <span className="text-xs text-muted-foreground">{videos.length} total</span>
        </div>

        {videos.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileVideo className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground mb-2">No files in the pipeline.</p>
              <p className="text-sm text-muted-foreground/60">
                Drop a video in the connected Google Drive folder to start.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {videos.map((video, i) => {
                const statusOrder = video.is_photo
                  ? STATUS_ORDER_PHOTO
                  : STATUS_ORDER_VIDEO;
                const statusIdx = statusOrder.indexOf(video.status);
                const progress =
                  video.status === "failed"
                    ? 0
                    : ((statusIdx + 1) / statusOrder.length) * 100;

                return (
                  <motion.div
                    key={video.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <Card className="group hover:border-border transition-colors">
                      <CardContent className="py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Thumbnail placeholder */}
                            <div className="w-14 h-10 bg-muted rounded-lg shrink-0 flex items-center justify-center overflow-hidden">
                              {video.is_photo ? (
                                <Camera className="w-5 h-5 text-muted-foreground/50" />
                              ) : (
                                <Play className="w-5 h-5 text-muted-foreground/50" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-medium text-sm truncate">
                                {video.filename}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {(video.size_bytes / (1024 * 1024)).toFixed(1)} MB
                                {video.duration_seconds &&
                                  ` / ${Math.round(video.duration_seconds)}s`}
                                {!video.is_photo &&
                                  video.duration_seconds != null &&
                                  (video.duration_seconds >
                                  LONG_FORM_THRESHOLD_SECONDS ? (
                                    <span className="ml-1.5 text-cyan-400 font-medium">
                                      Long-form
                                    </span>
                                  ) : (
                                    <span className="ml-1.5 text-muted-foreground/60">
                                      Short-form
                                    </span>
                                  ))}
                                {video.opus_clip_score != null && (
                                  <span className="ml-2 text-yellow-400 font-medium">
                                    Score: {video.opus_clip_score}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={
                                STATUS_STYLES[video.status] ||
                                "bg-gray-600 text-white border-transparent"
                              }
                            >
                              {video.status}
                            </Badge>
                          </div>
                        </div>

                        <Progress
                          value={progress}
                          className={`h-1.5 ${
                            video.status === "failed"
                              ? "[&>div]:bg-red-500"
                              : "[&>div]:bg-green-500"
                          }`}
                        />

                        <div className="flex justify-between mt-2">
                          {statusOrder.map((s, idx) => (
                            <span
                              key={s}
                              className={`text-[10px] hidden sm:inline ${
                                idx <= statusIdx
                                  ? "text-green-400"
                                  : "text-muted-foreground/40"
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                          <span className="sm:hidden text-[10px] text-muted-foreground">
                            {statusIdx + 1}/{statusOrder.length}
                          </span>
                        </div>

                        {video.error_message && (
                          <div className="mt-2 flex items-center gap-2">
                            <p className="text-xs text-destructive flex-1 bg-destructive/10 p-2 rounded">
                              {video.error_message}
                            </p>
                            {video.status === "failed" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRetry(video.id)}
                                disabled={retrying === video.id}
                                className="shrink-0"
                              >
                                {retrying === video.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <RotateCcw className="mr-1 h-3 w-3" />
                                    Retry
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Action buttons for completed items */}
                        {(video.status as string) === "clipped" && (
                          <div className="mt-2 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" className="text-xs gap-1">
                              <Eye className="h-3 w-3" />
                              Preview
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs gap-1">
                              <Sparkles className="h-3 w-3" />
                              Generate Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReprocess(video.id)}
                              disabled={reprocessing === video.id}
                              className="text-xs gap-1"
                            >
                              {reprocessing === video.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <RotateCcw className="h-3 w-3" />
                                  Reprocess
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      {/* Source Videos Section (collapsible) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <button
          onClick={() => setSourceVideosOpen(!sourceVideosOpen)}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full"
        >
          {sourceVideosOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
          Source Videos
          <span className="text-xs text-muted-foreground/60">(long-form originals)</span>
        </button>

        <AnimatePresence>
          {sourceVideosOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <Card className="mt-3">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Register Source Video</CardTitle>
                    <Button size="sm" variant="outline" className="gap-1">
                      <Plus className="h-3 w-3" />
                      Add Source
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Source video registration coming soon. For now, clips are automatically
                    imported from Google Drive.
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
