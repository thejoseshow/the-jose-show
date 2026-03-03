"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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

const STATUS_ORDER = [
  "new",
  "downloading",
  "downloaded",
  "transcribing",
  "transcribed",
  "clipping",
  "clipped",
];

export default function UploadsPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/pipeline/status");
      const data = await res.json();
      if (data.success) setVideos(data.data || []);
      setLoading(false);
    }
    load();

    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

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
        <h1 className="text-2xl font-bold">Upload Pipeline</h1>
        <p className="text-sm text-muted-foreground">
          Auto-checks Google Drive every 15 minutes
        </p>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No videos in the pipeline.</p>
            <p className="text-sm text-muted-foreground/60">
              Drop a video file in the connected Google Drive folder to start.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => {
            const statusIdx = STATUS_ORDER.indexOf(video.status);
            const progress =
              video.status === "failed"
                ? 0
                : ((statusIdx + 1) / STATUS_ORDER.length) * 100;

            return (
              <Card key={video.id}>
                <CardContent className="py-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-sm">{video.filename}</h3>
                      <p className="text-xs text-muted-foreground">
                        {(video.size_bytes / (1024 * 1024)).toFixed(1)} MB
                        {video.duration_seconds &&
                          ` / ${Math.round(video.duration_seconds)}s`}
                      </p>
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
                    {STATUS_ORDER.map((s, i) => (
                      <span
                        key={s}
                        className={`text-[10px] ${
                          i <= statusIdx ? "text-green-400" : "text-muted-foreground/40"
                        }`}
                      >
                        {s}
                      </span>
                    ))}
                  </div>

                  {video.error_message && (
                    <p className="text-xs text-destructive mt-2 bg-destructive/10 p-2 rounded">
                      {video.error_message}
                    </p>
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
