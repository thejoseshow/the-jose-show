"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { ContentTemplate, Platform } from "@/lib/types";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<ContentTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/templates");
      const data = await res.json();
      if (data.success) setTemplates(data.data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDelete() {
    if (!deletingTemplate) return;
    setDeleting(true);
    const res = await fetch(`/api/templates/${deletingTemplate.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id));
    }
    setDeleting(false);
    setDeletingTemplate(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Button onClick={() => setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4 mr-1" />
          Create Template
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No templates yet.</p>
            <p className="text-sm text-muted-foreground/60">
              Create a template to auto-generate recurring content with AI copy.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id} className="hover:border-muted-foreground/30 transition-colors">
              <CardContent className="py-5">
                <div className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium">{template.name}</h3>
                      {template.is_recurring && template.frequency && (
                        <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-600/10">
                          {FREQUENCY_LABELS[template.frequency]}
                          {template.preferred_day !== null && ` (${DAY_LABELS[template.preferred_day]})`}
                        </Badge>
                      )}
                      <Badge variant={template.is_active ? "secondary" : "outline"}>
                        {template.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {template.default_platforms.map((p) => (
                        <Badge key={p} variant="outline" className="text-xs">
                          {p}
                        </Badge>
                      ))}
                      {template.hashtags.length > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {template.hashtags.length} hashtags
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingTemplate(template)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingTemplate(template)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
          </DialogHeader>
          <TemplateForm
            onClose={() => setShowCreate(false)}
            onSaved={(t) => setTemplates((prev) => [...prev, t])}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          {editingTemplate && (
            <TemplateForm
              initialData={editingTemplate}
              onClose={() => setEditingTemplate(null)}
              onSaved={(updated) => {
                setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                setEditingTemplate(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingTemplate} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deletingTemplate?.name}&rdquo; and cannot be undone.
              Existing content using this template will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TemplateForm({
  initialData,
  onClose,
  onSaved,
}: {
  initialData?: ContentTemplate;
  onClose: () => void;
  onSaved: (template: ContentTemplate) => void;
}) {
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name || "");
  const [slug, setSlug] = useState(initialData?.slug || "");
  const [prefix, setPrefix] = useState(initialData?.prefix || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [promptHint, setPromptHint] = useState(initialData?.prompt_hint || "");
  const [platforms, setPlatforms] = useState<Platform[]>(initialData?.default_platforms || []);
  const [hashtags, setHashtags] = useState(initialData?.hashtags?.join(", ") || "");
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring || false);
  const [frequency, setFrequency] = useState(initialData?.frequency || "");
  const [preferredDay, setPreferredDay] = useState<string>(
    initialData?.preferred_day !== null && initialData?.preferred_day !== undefined
      ? String(initialData.preferred_day)
      : ""
  );
  const [isActive, setIsActive] = useState(initialData?.is_active ?? true);
  const [saving, setSaving] = useState(false);

  // Auto-generate slug from name (only for new templates)
  function handleNameChange(value: string) {
    setName(value);
    if (!isEdit) {
      setSlug(
        value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, "")
          .replace(/\s+/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-|-$/g, "")
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      slug,
      prefix,
      description: description || null,
      prompt_hint: promptHint,
      default_platforms: platforms,
      hashtags: hashtags
        ? hashtags.split(",").map((h) => h.trim()).filter(Boolean)
        : [],
      is_recurring: isRecurring,
      frequency: isRecurring && frequency ? frequency : null,
      preferred_day: isRecurring && preferredDay !== "" ? Number(preferredDay) : null,
      is_active: isActive,
    };

    const res = await fetch(
      isEdit ? `/api/templates/${initialData.id}` : "/api/templates",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await res.json();
    if (data.success) {
      onSaved(data.data);
      onClose();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g., Bachata Tip of the Week"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Slug</Label>
        <Input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="e.g., bachata-tip"
        />
      </div>
      <div className="space-y-2">
        <Label>Prefix</Label>
        <Input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          placeholder="e.g., Bachata Tip of the Week"
        />
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What this template series is about..."
        />
      </div>
      <div className="space-y-2">
        <Label>AI Prompt Hint</Label>
        <Textarea
          value={promptHint}
          onChange={(e) => setPromptHint(e.target.value)}
          rows={3}
          placeholder="Creative direction for Claude when generating copy..."
        />
      </div>
      <div className="space-y-2">
        <Label>Default Platforms</Label>
        <div className="flex gap-2 flex-wrap">
          {(["youtube", "facebook", "instagram", "tiktok"] as Platform[]).map((p) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPlatforms((prev) =>
                  prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                )
              }
              className={
                platforms.includes(p)
                  ? "border-purple-500 bg-purple-600/20 text-purple-400"
                  : ""
              }
            >
              {p}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Hashtags (comma-separated)</Label>
        <Textarea
          value={hashtags}
          onChange={(e) => setHashtags(e.target.value)}
          rows={2}
          placeholder="#bachata, #thejoseshow, ..."
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="recurring-toggle">Recurring</Label>
        <Switch
          id="recurring-toggle"
          checked={isRecurring}
          onCheckedChange={(checked) => {
            setIsRecurring(checked);
            if (!checked) {
              setFrequency("");
              setPreferredDay("");
            }
          }}
        />
      </div>
      {isRecurring && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="biweekly">Biweekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Preferred Day</Label>
            <Select value={preferredDay} onValueChange={setPreferredDay}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {DAY_LABELS.map((label, i) => (
                  <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label htmlFor="active-toggle">Active</Label>
        <Switch
          id="active-toggle"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!name || !slug || !prefix || saving}
          className="bg-purple-600 hover:bg-purple-700"
        >
          {saving ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Template"}
        </Button>
      </div>
    </form>
  );
}
