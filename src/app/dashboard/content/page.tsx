"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Video } from "lucide-react";
import type { ContentListItem, ContentStatus, Platform } from "@/lib/types";

export default function ContentPageWrapper() {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <ContentPage />
    </Suspense>
  );
}

const STATUS_OPTIONS: { value: ContentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "approved", label: "Approved" },
  { value: "published", label: "Published" },
  { value: "failed", label: "Failed" },
];

const PLATFORM_OPTIONS: { value: Platform | "all"; label: string }[] = [
  { value: "all", label: "All Platforms" },
  { value: "youtube", label: "YouTube" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
];

function ContentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [content, setContent] = useState<ContentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const statusFilter = searchParams.get("status") || "";
  const platformFilter = searchParams.get("platform") || "";

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (platformFilter) params.set("platform", platformFilter);

      const res = await fetch(`/api/content?${params}`);
      const data = await res.json();
      if (data.success) setContent(data.data || []);
      setLoading(false);
    }
    load();
  }, [statusFilter, platformFilter]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(`/dashboard/content?${params}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Library</h1>
        <Button onClick={() => setShowCreate(true)} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 mr-1" />
          Create Content
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <Tabs value={statusFilter || "all"} onValueChange={(v) => setFilter("status", v)}>
          <TabsList>
            {STATUS_OPTIONS.map((opt) => (
              <TabsTrigger key={opt.value} value={opt.value} className="text-xs">
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Select value={platformFilter || "all"} onValueChange={(v) => setFilter("platform", v)}>
          <SelectTrigger className="w-[150px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : content.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">
              {statusFilter
                ? `No content with status "${statusFilter}"`
                : "No content yet"}
            </p>
            <p className="text-sm text-muted-foreground/60">
              Drop a video in Google Drive or create content manually.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {content.map((item) => (
            <Link key={item.id} href={`/dashboard/content/${item.id}`}>
              <Card className="overflow-hidden hover:border-muted-foreground/30 transition-colors">
                <div className="aspect-video bg-muted relative">
                  {item.thumbnail_url ? (
                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Video className="w-12 h-12" strokeWidth={1} />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <StatusBadge status={item.status} />
                  </div>
                </div>
                <CardContent className="p-4">
                  <h3 className="font-medium text-sm truncate">{item.title}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex gap-1">
                      {item.platforms.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {p}
                        </Badge>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Content</DialogTitle>
          </DialogHeader>
          <CreateContentForm onClose={() => setShowCreate(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateContentForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [platforms, setPlatforms] = useState<Platform[]>(["youtube"]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, platforms }),
    });
    const data = await res.json();
    if (data.success) {
      router.push(`/dashboard/content/${data.data.id}`);
    }
    setSaving(false);
  }

  function togglePlatform(p: Platform) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Content title..."
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Platforms</Label>
        <div className="flex gap-2">
          {(["youtube", "facebook", "instagram", "tiktok"] as Platform[]).map((p) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => togglePlatform(p)}
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
      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!title || saving}
          className="bg-red-600 hover:bg-red-700"
        >
          {saving ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}
