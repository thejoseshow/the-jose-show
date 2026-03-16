"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Camera, Loader2, Play, RotateCcw } from "lucide-react";
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

export default function UploadsPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function loadVideos() {
    const res = await fetch("/api/pipeline/status");
    const data = await res.json();
    if (data.success) setVideos(data.data || []);
  }

  useEffect(() => {
    loadVideos().then(() => setLoading(false));
    const interval = setInterval(loadVideos, 30000);
    return () => clearInterval(interval);
  }, []);

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
        setProcessResult(parts.length > 0 ? parts.join(", ") : "No new videos to process");
      } else {
        setProcessResult(data.error || "Processing failed");
      }
      await loadVideos();
    } catch {
      setProcessResult("Failed to trigger processing");
    }
    setProcessing(false);
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

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Upload Pipeline</h1>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Upload Pipeline</h1>
          <p className="text-sm text-muted-foreground">
            Auto-checks Google Drive daily at 8 AM
          </p>
        </div>
        <div className="flex items-center gap-3">
          {processResult && (
            <span className="text-sm text-muted-foreground">{processResult}</span>
          )}
          <Button
            onClick={handleProcessNow}
            disabled={processing}
            className="bg-red-600 hover:bg-red-700"
          >
            {processing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Process Now
              </>
            )}
          </Button>
        </div>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No files in the pipeline.</p>
            <p className="text-sm text-muted-foreground/60">
              Drop a video or photo in the connected Google Drive folder to start.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => {
            const statusOrder = video.is_photo ? STATUS_ORDER_PHOTO : STATUS_ORDER_VIDEO;
            const statusIdx = statusOrder.indexOf(video.status);
            const progress =
              video.status === "failed"
                ? 0
                : ((statusIdx + 1) / statusOrder.length) * 100;

            return (
              <Card key={video.id}>
                <CardContent className="py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {video.is_photo && <Camera className="h-4 w-4 text-muted-foreground" />}
                      <div>
                        <h3 className="font-medium text-sm">{video.filename}</h3>
                        <p className="text-xs text-muted-foreground">
                          {(video.size_bytes / (1024 * 1024)).toFixed(1)} MB
                          {video.duration_seconds &&
                            ` / ${Math.round(video.duration_seconds)}s`}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={STATUS_STYLES[video.status] || "bg-gray-600 text-white border-transparent"}
                    >
                      {video.status}
                    </Badge>
                  </div>

                  <Progress
                    value={progress}
                    className={`h-2 ${video.status === "failed" ? "[&>div]:bg-red-500" : "[&>div]:bg-green-500"}`}
                  />

                  <div className="flex justify-between mt-2">
                    {statusOrder.map((s, i) => (
                      <span
                        key={s}
                        className={`text-[10px] hidden sm:inline ${
                          i <= statusIdx ? "text-green-400" : "text-muted-foreground/40"
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
