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
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import type { Content, Platform } from "@/lib/types";

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

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/content/${id}`);
      const data = await res.json();
      if (data.success && data.data) {
        const c = data.data as Content;
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
      }
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

  async function handleDelete() {
    await fetch(`/api/content/${id}`, { method: "DELETE" });
    toast.success("Content deleted");
    router.push("/dashboard/content");
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
  const canPublish = content.status === "approved";
  const isPublished = content.status === "published";

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
