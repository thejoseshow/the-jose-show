"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Beaker, Trophy, Clock } from "lucide-react";
import { toast } from "sonner";
import type { ContentListItem } from "@/lib/types";

interface ABGroup {
  ab_group_id: string;
  variantA: ContentListItem | null;
  variantB: ContentListItem | null;
  decided: boolean;
  winner: "A" | "B" | null;
}

export default function ABTestsPage() {
  const [groups, setGroups] = useState<ABGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/content?limit=100");
        const data = await res.json();
        if (!data.success) return;

        const items = (data.data || []) as ContentListItem[];
        const groupMap = new Map<string, ABGroup>();

        for (const item of items) {
          if (!item.ab_group_id) continue;
          if (!groupMap.has(item.ab_group_id)) {
            groupMap.set(item.ab_group_id, {
              ab_group_id: item.ab_group_id,
              variantA: null,
              variantB: null,
              decided: false,
              winner: null,
            });
          }
          const group = groupMap.get(item.ab_group_id)!;
          if (item.variant === "A") {
            group.variantA = item;
          } else if (item.variant === "B") {
            group.variantB = item;
          }
        }

        // Determine decided state
        for (const group of groupMap.values()) {
          const a = group.variantA as ContentListItem & { ab_winner?: boolean; ab_decided_at?: string } | null;
          const b = group.variantB as ContentListItem & { ab_winner?: boolean; ab_decided_at?: string } | null;
          if (a?.ab_decided_at || b?.ab_decided_at) {
            group.decided = true;
            group.winner = a?.ab_winner ? "A" : b?.ab_winner ? "B" : null;
          }
        }

        setGroups(Array.from(groupMap.values()).sort((a, b) => {
          // Active tests first, then decided
          if (a.decided !== b.decided) return a.decided ? 1 : -1;
          return 0;
        }));
      } catch {
        toast.error("Failed to load A/B tests");
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">A/B Tests</h1>
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Beaker className="w-6 h-6 text-purple-400" />
        <h1 className="text-2xl font-bold">A/B Tests</h1>
        <Badge variant="secondary">{groups.length} test(s)</Badge>
      </div>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-2">No A/B tests yet.</p>
            <p className="text-sm text-muted-foreground/60">
              Enable A/B testing in Settings to start generating variant content.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.ab_group_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {group.decided ? (
                      <Trophy className="w-4 h-4 text-yellow-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-blue-400 animate-pulse" />
                    )}
                    <CardTitle className="text-sm">
                      {group.variantA?.title || "Untitled"}
                    </CardTitle>
                  </div>
                  <Badge variant={group.decided ? "secondary" : "outline"} className={group.decided ? "bg-green-600/20 text-green-400" : "text-blue-400"}>
                    {group.decided ? `Winner: ${group.winner}` : "Active"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Variant A */}
                  <div className={`p-3 rounded-lg border ${group.winner === "A" ? "border-yellow-500/50 bg-yellow-600/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-400">A</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{group.variantA?.status}</span>
                      {group.winner === "A" && <Trophy className="w-3 h-3 text-yellow-400" />}
                    </div>
                    <p className="text-sm mb-1">{group.variantA?.title}</p>
                    <div className="flex gap-1 mt-2">
                      {group.variantA?.platforms.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">{p}</Badge>
                      ))}
                    </div>
                    {group.variantA && (
                      <Link href={`/dashboard/content/${group.variantA.id}`}>
                        <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-xs">View details</Button>
                      </Link>
                    )}
                  </div>

                  {/* Variant B */}
                  <div className={`p-3 rounded-lg border ${group.winner === "B" ? "border-yellow-500/50 bg-yellow-600/5" : "border-border"}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs border-purple-500/50 text-purple-400">B</Badge>
                      <span className="text-xs text-muted-foreground capitalize">{group.variantB?.status || "—"}</span>
                      {group.winner === "B" && <Trophy className="w-3 h-3 text-yellow-400" />}
                    </div>
                    <p className="text-sm mb-1">{group.variantB?.title || "Not generated"}</p>
                    <div className="flex gap-1 mt-2">
                      {group.variantB?.platforms.map((p) => (
                        <Badge key={p} variant="secondary" className="text-[10px] px-1.5 py-0">{p}</Badge>
                      ))}
                    </div>
                    {group.variantB && (
                      <Link href={`/dashboard/content/${group.variantB.id}`}>
                        <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-xs">View details</Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
