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
import { Plus, Video, CheckSquare, Send, Loader2, XCircle, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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
  { value: "partially_published", label: "Partial" },
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const statusFilter = searchParams.get("status") || "";
  const platformFilter = searchParams.get("platform") || "";
  const languageFilter = searchParams.get("language") || "";

  async function loadContent() {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (platformFilter) params.set("platform", platformFilter);
    if (languageFilter) params.set("language", languageFilter);

    const res = await fetch(`/api/content?${params}`);
    const data = await res.json();
    if (data.success) setContent(data.data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadContent();
    setSelectedIds(new Set());
  }, [statusFilter, platformFilter, languageFilter]);

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    router.push(`/dashboard/content?${params}`);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    setBulkApproving(true);
    try {
      const res = await fetch("/api/content/approve-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Approved ${data.approved} item(s)`);
        setSelectedIds(new Set());
        await loadContent();
      } else {
        toast.error("Bulk approve failed", { description: data.error });
      }
    } catch {
      toast.error("Bulk approve failed");
    }
    setBulkApproving(false);
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    setBulkRejecting(true);
    try {
      const res = await fetch("/api/content/reject-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Rejected ${data.rejected} item(s)`);
        setSelectedIds(new Set());
        await loadContent();
      } else {
        toast.error("Bulk reject failed", { description: data.error });
      }
    } catch {
      toast.error("Bulk reject failed");
    }
    setBulkRejecting(false);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} item(s)? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch("/api/content/delete-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Deleted ${data.deleted} item(s)`);
        setSelectedIds(new Set());
        await loadContent();
      } else {
        toast.error("Bulk delete failed", { description: data.error });
      }
    } catch {
      toast.error("Bulk delete failed");
    }
    setBulkDeleting(false);
  }

  async function handleQuickPublish(e: React.MouseEvent, itemId: string) {
    e.preventDefault();
    e.stopPropagation();
    setPublishingId(itemId);
    try {
      const res = await fetch(`/api/content/${itemId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Published");
        await loadContent();
      } else {
        toast.error("Publish failed", { description: data.error });
      }
    } catch {
      toast.error("Publish failed");
    }
    setPublishingId(null);
  }

  const approvableSelected = content.filter(
    (c) => selectedIds.has(c.id) && (c.status === "draft" || c.status === "review")
  );
  const rejectableSelected = content.filter(
    (c) => selectedIds.has(c.id) && (c.status === "review" || c.status === "approved")
  );
  const deletableSelected = content.filter(
    (c) => selectedIds.has(c.id) && c.status !== "published" && c.status !== "partially_published"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content Library</h1>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                onClick={handleBulkApprove}
                disabled={bulkApproving || approvableSelected.length === 0}
                variant="secondary"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {bulkApproving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <CheckSquare className="mr-1 h-4 w-4" />
                )}
                Approve {approvableSelected.length > 0 ? `(${approvableSelected.length})` : ""}
              </Button>
              <Button
                onClick={handleBulkReject}
                disabled={bulkRejecting || rejectableSelected.length === 0}
                variant="secondary"
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                {bulkRejecting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="mr-1 h-4 w-4" />
                )}
                Reject {rejectableSelected.length > 0 ? `(${rejectableSelected.length})` : ""}
              </Button>
              <Button
                onClick={handleBulkDelete}
                disabled={bulkDeleting || deletableSelected.length === 0}
                variant="destructive"
              >
                {bulkDeleting ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-1 h-4 w-4" />
                )}
                Delete {deletableSelected.length > 0 ? `(${deletableSelected.length})` : ""}
              </Button>
            </>
          )}
          <Button onClick={() => setShowCreate(true)} className="bg-red-600 hover:bg-red-700">
            <Plus className="w-4 h-4 mr-1" />
            Create Content
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="overflow-x-auto w-full sm:w-auto">
          <Tabs value={statusFilter || "all"} onValueChange={(v) => setFilter("status", v)}>
            <TabsList>
              {STATUS_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <Select value={platformFilter || "all"} onValueChange={(v) => setFilter("platform", v)}>
          <SelectTrigger className="w-full sm:w-[150px] h-9 text-xs">
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
        <Select value={languageFilter || "all"} onValueChange={(v) => setFilter("language", v)}>
          <SelectTrigger className="w-full sm:w-[120px] h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Languages</SelectItem>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="es">Spanish</SelectItem>
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
            <div key={item.id} className="relative group">
              {/* Checkbox overlay */}
              <div
                className="absolute top-2 left-2 z-10"
                onClick={(e) => e.preventDefault()}
              >
                <Checkbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={() => toggleSelect(item.id)}
                  className="bg-black/50 border-white/50 data-[state=checked]:bg-red-600"
                />
              </div>

              <Link href={`/dashboard/content/${item.id}`}>
                <Card className={`overflow-hidden hover:border-muted-foreground/30 transition-colors ${selectedIds.has(item.id) ? "ring-2 ring-red-500" : ""}`}>
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
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-medium text-sm truncate">{item.title}</h3>
                      {item.language && (
                        <Badge variant="outline" className={`text-[10px] px-1 py-0 shrink-0 ${item.language === "es" ? "border-orange-500/50 text-orange-400" : "border-blue-500/50 text-blue-400"}`}>
                          {item.language.toUpperCase()}
                        </Badge>
                      )}
                      {item.variant && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 border-purple-500/50 text-purple-400">
                          {item.variant}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex gap-1">
                        {item.platforms.map((p) => (
                          <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {p}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {(item.status === "approved" || item.status === "partially_published") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            disabled={publishingId === item.id}
                            onClick={(e) => handleQuickPublish(e, item.id)}
                          >
                            {publishingId === item.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <Send className="h-3 w-3 mr-1" />
                                Publish
                              </>
                            )}
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
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
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, platforms }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/dashboard/content/${data.data.id}`);
      }
    } catch {
      // silently fail
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
