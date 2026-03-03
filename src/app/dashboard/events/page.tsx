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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
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

  useEffect(() => {
    async function load() {
      const res = await fetch("/api/events");
      const data = await res.json();
      if (data.success) setEvents(data.data || []);
      setLoading(false);
    }
    load();
  }, []);

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
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{event.name}</h3>
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
                  <div className="text-right text-sm text-muted-foreground">
                    {event.promo_schedule
                      ? `${event.promo_schedule.filter((p) => p.generated).length}/${event.promo_schedule.length} promos`
                      : "No promos"}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Event</DialogTitle>
          </DialogHeader>
          <CreateEventForm
            onClose={() => setShowCreate(false)}
            onCreated={(e) => setEvents((prev) => [e, ...prev])}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateEventForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (event: Event) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<EventType>("bachata_class");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        location,
        start_date: new Date(startDate).toISOString(),
        description,
      }),
    });
    const data = await res.json();
    if (data.success) {
      onCreated(data.data);
      onClose();
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleCreate} className="space-y-4">
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
          {saving ? "Creating..." : "Create Event"}
        </Button>
      </div>
    </form>
  );
}
