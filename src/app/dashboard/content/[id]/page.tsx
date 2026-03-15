"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Loader2, Trash2, Wand2, Video, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Content, ContentTemplate, Platform, PublishLog, RenderJob } from "@/lib/types";

export default function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [content, setContent] = useState<Content | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ytTitle, setYtTitle] = useState("");
  const [ytDescription, setYtDescription] = useState("");
  const [ytTags, setYtTags] = useState("");
  const [fbText, setFbText] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [tkCaption, setTkCaption] = useState("");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [isSpanish, setIsSpanish] = useState(false);
  const [publishLogs, setPublishLogs] = useState<PublishLog[]>([]);
  const [retryingPlatform, setRetryingPlatform] = useState<string | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [rendering, setRendering] = useState(false);
  const [captionStyle, setCaptionStyle] = useState("default");

  useEffect(() => {
    async function load() {
      const [contentRes, templatesRes] = await Promise.all([
        fetch(`/api/content/${id}`),
        fetch("/api/templates?active=true"),
      ]);
      const data = await contentRes.json();
      if (data.success && data.data) {
        const c = data.data as Content & { publish_log?: PublishLog[] };
        setPublishLogs(c.publish_log || []);
        setContent(c);
        setTitle(c.title);
        setDescription(c.description || "");
        setYtTitle(c.youtube_title || "");
        setYtDescription(c.youtube_description || "");
        setYtTags(c.youtube_tags?.join(", ") || "");
        setFbText(c.facebook_text || "");
        setIgCaption(c.instagram_caption || "");
        setTkCaption(c.tiktok_caption || "");
        setPlatforms(c.platforms || []);
        setScheduledAt(c.scheduled_at ? c.scheduled_at.slice(0, 16) : "");
        if (c.template_id) setSelectedTemplateId(c.template_id);
      }
      const tData = await templatesRes.json();
      if (tData.success) setTemplates(tData.data || []);
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        youtube_title: ytTitle || null,
        youtube_description: ytDescription || null,
        youtube_tags: ytTags ? ytTags.split(",").map((t) => t.trim()) : null,
        facebook_text: fbText || null,
        instagram_caption: igCaption || null,
        tiktok_caption: tkCaption || null,
        platforms,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    toast(data.success ? "Content saved" : "Failed to save", {
      description: data.success ? undefined : data.error,
    });
    setSaving(false);
  }

  async function handleApprove() {
    const res = await fetch(`/api/content/${id}/approve`, { method: "POST" });
    const data = await res.json();
    if (data.success) {
      setContent((prev) => (prev ? { ...prev, status: "approved" } : prev));
      toast.success("Content approved");
    }
  }

  async function handlePublish() {
    setPublishing(true);
    const res = await fetch(`/api/content/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms }),
    });
    const data = await res.json();
    if (data.success) {
      setContent((prev) => (prev ? { ...prev, status: "published" } : prev));
      toast.success("Content published");
    } else {
      toast.error("Publish failed", { description: data.error });
    }
    setPublishing(false);
  }

  async function handleRetryPlatform(platform: Platform) {
    setRetryingPlatform(platform);
    try {
      const res = await fetch(`/api/content/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: [platform] }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Retried ${platform}`);
        // Reload content to refresh status and logs
        const contentRes = await fetch(`/api/content/${id}`);
        const refreshed = await contentRes.json();
        if (refreshed.success && refreshed.data) {
          const c = refreshed.data as Content & { publish_log?: PublishLog[] };
          setContent(c);
          setPublishLogs(c.publish_log || []);
        }
      } else {
        toast.error(`Retry failed for ${platform}`, { description: data.error });
      }
    } catch {
      toast.error("Retry request failed");
    }
    setRetryingPlatform(null);
  }

  async function handleDelete() {
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    toast.success("Content deleted");
    router.push("/dashboard/content");
  }

  async function handleGenerateCopy() {
    if (!selectedTemplateId) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/content/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: selectedTemplateId,
          additional_context: additionalContext || undefined,
          is_spanish: isSpanish,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        const c = data.data as Content;
        setYtTitle(c.youtube_title || "");
        setYtDescription(c.youtube_description || "");
        setYtTags(c.youtube_tags?.join(", ") || "");
        setFbText(c.facebook_text || "");
        setIgCaption(c.instagram_caption || "");
        setTkCaption(c.tiktok_caption || "");
        toast.success("Copy generated from template");
      } else {
        toast.error("Generation failed", { description: data.error });
      }
    } catch {
      toast.error("Failed to generate copy");
    }
    setGenerating(false);
  }

  async function handleGenerateVideo(compositionId: string) {
    if (!content) return;
    setRendering(true);
    try {
      const inputProps: Record<string, unknown> =
        compositionId === "BrandedClip"
          ? {
              clipUrl: content.media_url || "",
              clipDurationInFrames: 150, // 5s default, Lambda will adjust
              title: content.title,
              socialHandles: {
                instagram: "@thejoseadelshow",
                tiktok: "@thejoseshow_",
                youtube: "@Thejoseshowtv",
              },
            }
          : compositionId === "CaptionOverlay"
            ? {
                clipUrl: content.media_url || "",
                clipDurationInFrames: 150,
                words: [],
                captionStyle,
              }
            : {};

      const res = await fetch("/api/remotion/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          composition_id: compositionId,
          content_id: content.id,
          input_props: inputProps,
        }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setRenderJob(data.data as RenderJob);
        toast.success("Video render started");
        pollRenderStatus(data.data.render_id);
      } else {
        toast.error("Failed to start render", { description: data.error });
      }
    } catch {
      toast.error("Failed to start video render");
    }
    setRendering(false);
  }

  function pollRenderStatus(renderId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/remotion/status/${renderId}`);
        const data = await res.json();
        if (data.success && data.data) {
          const job = data.data as RenderJob;
          setRenderJob(job);
          if (job.status === "completed") {
            clearInterval(interval);
            toast.success("Video render completed!");
            if (job.output_url) {
              setContent((prev) =>
                prev ? { ...prev, media_url: job.output_url! } : prev
              );
            }
          } else if (job.status === "failed") {
            clearInterval(interval);
            toast.error("Render failed", { description: job.error_message || undefined });
          }
        }
      } catch {
        clearInterval(interval);
      }
    }, 3000);
    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(interval), 5 * 60 * 1000);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96 rounded-xl" />
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Content not found.</p>
        <Link href="/dashboard/content" className="text-primary text-sm">
          Back to library
        </Link>
      </div>
    );
  }

  const canApprove = content.status === "draft" || content.status === "review";
  const canPublish = content.status === "approved" || content.status === "partially_published";
  const isPublished = content.status === "published";
  const isPartiallyPublished = content.status === "partially_published";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/content">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">{content.title}</h1>
          <StatusBadge status={content.status} />
        </div>
        <div className="flex gap-2">
          {canApprove && (
            <Button onClick={handleApprove} variant="secondary" className="bg-blue-600 hover:bg-blue-700 text-white">
              Approve
            </Button>
          )}
          {canPublish && (
            <Button
              onClick={handlePublish}
              disabled={publishing}
              className="bg-green-600 hover:bg-green-700"
            >
              {publishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Publish Now"
              )}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete content?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete &quot;{content.title}&quot; and cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Media Preview */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="aspect-[9/16] bg-muted rounded-xl overflow-hidden">
                {content.media_url ? (
                  <video src={content.media_url} controls className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No media
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Platforms */}
          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="flex gap-2 flex-wrap">
              {(["youtube", "facebook", "instagram", "tiktok"] as Platform[]).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPlatforms((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                    )
                  }
                  disabled={isPublished}
                  className={
                    platforms.includes(p)
                      ? "border-red-500 bg-red-600/20 text-red-400"
                      : ""
                  }
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Schedule</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={isPublished}
            />
          </div>

          {/* Apply Template */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <Label className="text-sm font-medium">Apply Template</Label>
              <Select
                value={selectedTemplateId}
                onValueChange={setSelectedTemplateId}
                disabled={isPublished}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Additional context (optional)..."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                disabled={isPublished}
                rows={2}
              />
              <div className="flex items-center justify-between">
                <Label htmlFor="spanish-toggle" className="text-sm">Spanish content</Label>
                <Switch
                  id="spanish-toggle"
                  checked={isSpanish}
                  onCheckedChange={setIsSpanish}
                  disabled={isPublished}
                />
              </div>
              <Button
                onClick={handleGenerateCopy}
                disabled={!selectedTemplateId || isPublished || generating}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {generating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 className="mr-2 h-4 w-4" />
                    Generate Copy
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Generate Video */}
          <Card>
            <CardContent className="py-4 space-y-3">
              <Label className="text-sm font-medium">Generate Video</Label>
              {renderJob && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={
                      renderJob.status === "completed" ? "text-green-400" :
                      renderJob.status === "failed" ? "text-red-400" :
                      "text-yellow-400"
                    }>
                      {renderJob.status === "rendering" ? "Rendering..." :
                       renderJob.status === "completed" ? "Completed" :
                       renderJob.status === "failed" ? "Failed" :
                       "Pending"}
                    </span>
                    {renderJob.status === "rendering" && (
                      <span className="text-muted-foreground">
                        {Math.round(renderJob.progress * 100)}%
                      </span>
                    )}
                  </div>
                  {renderJob.status === "rendering" && (
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-red-500 h-2 rounded-full transition-all"
                        style={{ width: `${renderJob.progress * 100}%` }}
                      />
                    </div>
                  )}
                  {renderJob.status === "failed" && renderJob.error_message && (
                    <p className="text-xs text-red-400">{renderJob.error_message}</p>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => handleGenerateVideo("BrandedClip")}
                  disabled={rendering || !content?.media_url}
                  variant="outline"
                  className="w-full justify-start"
                >
                  {rendering ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-2 h-4 w-4" />
                  )}
                  Branded Clip (Intro + Outro)
                </Button>
                <Select value={captionStyle} onValueChange={setCaptionStyle}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Caption style..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Default (Fade In)</SelectItem>
                    <SelectItem value="highlight">Highlight (Yellow Sweep)</SelectItem>
                    <SelectItem value="karaoke">Karaoke (Color Change)</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => handleGenerateVideo("CaptionOverlay")}
                  disabled={rendering || !content?.media_url}
                  variant="outline"
                  className="w-full justify-start"
                >
                  {rendering ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="mr-2 h-4 w-4" />
                  )}
                  Caption Overlay
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Publish History */}
          {publishLogs.length > 0 && (
            <Card>
              <CardContent className="py-4 space-y-3">
                <Label className="text-sm font-medium">Publish History</Label>
                <div className="space-y-2">
                  {publishLogs
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((log) => (
                      <div key={log.id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] px-1.5">{log.platform}</Badge>
                          <span className={
                            log.status === "success" ? "text-green-400" :
                            log.status === "failed" ? "text-red-400" :
                            "text-yellow-400"
                          }>
                            {log.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {log.published_at
                              ? new Date(log.published_at).toLocaleString()
                              : new Date(log.created_at).toLocaleString()}
                          </span>
                          {log.status === "failed" && isPartiallyPublished && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs px-2"
                              disabled={retryingPlatform === log.platform}
                              onClick={() => handleRetryPlatform(log.platform)}
                            >
                              {retryingPlatform === log.platform ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  {publishLogs.some((l) => l.status === "failed" && l.error_message) && (
                    <div className="mt-2 text-xs text-red-400/80 bg-red-600/10 p-2 rounded">
                      {publishLogs.filter((l) => l.status === "failed").map((l) => (
                        <p key={l.id}>{l.platform}: {l.error_message}</p>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Per-Platform Copy */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>General</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPublished} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} disabled={isPublished} rows={4} />
              </div>
            </CardContent>
          </Card>

          {platforms.includes("youtube") && (
            <Card>
              <CardHeader><CardTitle className="text-red-400">YouTube</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex justify-between">Title <span className="text-muted-foreground">{ytTitle.length}/100</span></Label>
                  <Input value={ytTitle} onChange={(e) => setYtTitle(e.target.value)} placeholder={title} disabled={isPublished} maxLength={100} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={ytDescription} onChange={(e) => setYtDescription(e.target.value)} disabled={isPublished} rows={4} />
                </div>
                <div className="space-y-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={ytTags} onChange={(e) => setYtTags(e.target.value)} disabled={isPublished} />
                </div>
              </CardContent>
            </Card>
          )}

          {platforms.includes("facebook") && (
            <Card>
              <CardHeader><CardTitle className="text-blue-400">Facebook</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Post Text</Label>
                  <Textarea value={fbText} onChange={(e) => setFbText(e.target.value)} disabled={isPublished} rows={4} />
                </div>
              </CardContent>
            </Card>
          )}

          {platforms.includes("instagram") && (
            <Card>
              <CardHeader><CardTitle className="text-pink-400">Instagram</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="flex justify-between">Caption <span className="text-muted-foreground">{igCaption.length}/2200</span></Label>
                  <Textarea value={igCaption} onChange={(e) => setIgCaption(e.target.value)} disabled={isPublished} maxLength={2200} rows={4} />
                </div>
              </CardContent>
            </Card>
          )}

          {platforms.includes("tiktok") && (
            <Card>
              <CardHeader><CardTitle className="text-cyan-400">TikTok</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label className="flex justify-between">Caption <span className="text-muted-foreground">{tkCaption.length}/2200</span></Label>
                  <Textarea value={tkCaption} onChange={(e) => setTkCaption(e.target.value)} disabled={isPublished} maxLength={2200} rows={4} />
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
