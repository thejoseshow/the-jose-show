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
import { RECURRENCE_PRESETS, buildMonthlyByDay, buildMonthlyLastWeekday } from "@/lib/recurrence";
import type { Event, EventType } from "@/lib/types";

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  bachata_class: "Bachata Class",
  dj_gig: "DJ / Hosting",
  starpoint_event: "Starpoint Event",
  rooftop_party: "Rooftop Party",
  dr_tour: "DR Tour",
  other: "Other",
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
      setLoading(false);
    }
    load();
  }, []);

  async function handleDelete() {
    if (!deletingEvent) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/events/${deletingEvent.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
      }
    } catch {
      // silently fail
    }
    setDeleting(false);
    setDeletingEvent(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Button onClick={() => setShowCreate(true)} className="bg-red-600 hover:bg-red-700">
          <Plus className="w-4 h-4 mr-1" />
          Create Event
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No events yet.</p>
            <p className="text-sm text-muted-foreground/60">
              Create your first event to auto-generate promo content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id} className="hover:border-muted-foreground/30 transition-colors">
              <CardContent className="py-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium truncate">{event.name}</h3>
                      <Badge variant="secondary">
                        {EVENT_TYPE_LABELS[event.type]}
                      </Badge>
                      {event.is_recurring && (
                        <Badge variant="outline" className="border-purple-500/50 text-purple-400 bg-purple-600/10">
                          Recurring
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {new Date(event.start_date).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {event.location && ` at ${event.location}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-muted-foreground mr-2">
                      {event.promo_schedule
                        ? `${event.promo_schedule.filter((p) => p.generated).length}/${event.promo_schedule.length} promos`
                        : "No promos"}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingEvent(event)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeletingEvent(event)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
          </DialogHeader>
          <EventForm
            onClose={() => setShowCreate(false)}
            onSaved={(e) => setEvents((prev) => [e, ...prev])}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          {editingEvent && (
            <EventForm
              initialData={editingEvent}
              onClose={() => setEditingEvent(null)}
              onSaved={(updated) => {
                setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
                setEditingEvent(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingEvent} onOpenChange={(open) => !open && setDeletingEvent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete event?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{deletingEvent?.name}&rdquo; and cannot be undone.
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

function EventForm({
  initialData,
  onClose,
  onSaved,
}: {
  initialData?: Event;
  onClose: () => void;
  onSaved: (event: Event) => void;
}) {
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name || "");
  const [type, setType] = useState<EventType>(initialData?.type || "bachata_class");
  const [location, setLocation] = useState(initialData?.location || "");
  const [startDate, setStartDate] = useState(
    initialData ? new Date(initialData.start_date).toISOString().slice(0, 16) : ""
  );
  const [description, setDescription] = useState(initialData?.description || "");
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring || false);
  const [recurrenceRule, setRecurrenceRule] = useState(initialData?.recurrence_rule || "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const payload = {
      name,
      type,
      location,
      start_date: new Date(startDate).toISOString(),
      description,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,
    };

    try {
      const res = await fetch(
        isEdit ? `/api/events/${initialData.id}` : "/api/events",
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
    } catch {
      // silently fail
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Event Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Starpoint Bachata Night"
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={(v) => setType(v as EventType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(EVENT_TYPE_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Location</Label>
        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., Starpoint Dance Sport, South Florida"
        />
      </div>
      <div className="space-y-2">
        <Label>Date & Time</Label>
        <Input
          type="datetime-local"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label htmlFor="recurring-toggle">Recurring Event</Label>
        <Switch
          id="recurring-toggle"
          checked={isRecurring}
          onCheckedChange={(checked) => {
            setIsRecurring(checked);
            if (!checked) setRecurrenceRule("");
          }}
        />
      </div>
      {isRecurring && (
        <div className="space-y-2">
          <Label>Recurrence Pattern</Label>
          <Select
            value={recurrenceRule}
            onValueChange={(v) => {
              if (v === "__MONTHLY_BY_DAY__" && startDate) {
                setRecurrenceRule(buildMonthlyByDay(new Date(startDate)));
              } else if (v === "__MONTHLY_LAST_WEEKDAY__" && startDate) {
                setRecurrenceRule(buildMonthlyLastWeekday(new Date(startDate)));
              } else {
                setRecurrenceRule(v);
              }
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select pattern" />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Event details..."
        />
      </div>
      <div className="flex gap-3 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={!name || !startDate || saving}
          className="bg-red-600 hover:bg-red-700"
        >
          {saving ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save Changes" : "Create Event"}
        </Button>
      </div>
    </form>
  );
}
