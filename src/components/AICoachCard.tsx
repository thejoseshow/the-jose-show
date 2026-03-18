"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw, Loader2, Lightbulb, TrendingUp, Hash } from "lucide-react";
import type { PerformanceInsight } from "@/lib/types";

type DateRange = "7" | "14" | "30" | "custom";

export default function AICoachCard({ compact = false }: { compact?: boolean }) {
  const [insight, setInsight] = useState<PerformanceInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("7");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/insights?latest=true");
      const data = await res.json();
      if (data.success && data.data) {
        setInsight(data.data);
      }
    } catch {
      // Non-critical
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const body: Record<string, string> = {};
      if (dateRange === "custom" && customStart && customEnd) {
        body.start_date = customStart;
        body.end_date = customEnd;
      } else if (dateRange !== "custom") {
        const days = parseInt(dateRange, 10);
        const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        body.start_date = start.toISOString().split("T")[0];
        body.end_date = new Date().toISOString().split("T")[0];
      }

      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setInsight({
          id: "on-demand",
          week_start: body.start_date || new Date().toISOString().split("T")[0],
          insights_json: data.data,
          created_at: new Date().toISOString(),
        });
      }
    } catch {
      // Non-critical
    }
    setRefreshing(false);
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <CardTitle className="text-base">AI Coach</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              <span className="ml-1.5">Analyze</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No insights yet. Click Analyze to generate your first performance report, or wait for the weekly digest.
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = insight.insights_json;
  const weekLabel = new Date(insight.week_start + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const dateRangeSelector = (
    <div className="flex flex-wrap gap-1.5">
      {(["7", "14", "30", "custom"] as DateRange[]).map((r) => (
        <Button
          key={r}
          variant={dateRange === r ? "secondary" : "ghost"}
          size="sm"
          className="h-6 text-xs px-2"
          onClick={() => setDateRange(r)}
        >
          {r === "custom" ? "Custom" : `${r}d`}
        </Button>
      ))}
    </div>
  );

  // Compact mode: summary + top 2 insights + analyze button
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-400" />
              <CardTitle className="text-sm font-medium">AI Coach</CardTitle>
            </div>
            {dateRangeSelector}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {dateRange === "custom" && (
            <div className="flex gap-2">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 text-xs" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 text-xs" />
            </div>
          )}
          {data.week_summary && (
            <p className="text-xs text-muted-foreground line-clamp-2">{data.week_summary}</p>
          )}
          {data.top_insights.slice(0, 2).map((ins, i) => (
            <p key={i} className="text-xs flex gap-1.5">
              <span className="text-muted-foreground shrink-0">&bull;</span>
              <span className="line-clamp-1">{ins}</span>
            </p>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Analyze
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <CardTitle className="text-base">AI Coach — {weekLabel}</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            <span className="ml-1.5">Refresh</span>
          </Button>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {dateRangeSelector}
          {dateRange === "custom" && (
            <div className="flex gap-2">
              <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
              <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary */}
        {data.week_summary && (
          <p className="text-sm text-muted-foreground">{data.week_summary}</p>
        )}

        {/* Top Insights */}
        {data.top_insights.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-medium text-muted-foreground">Top Insights</span>
            </div>
            <ul className="space-y-1.5">
              {data.top_insights.map((ins, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-muted-foreground shrink-0">&bull;</span>
                  <span>{ins}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Best Platform & Content Type */}
        <div className="grid grid-cols-2 gap-4">
          {data.platform_rankings.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Best Platform</span>
              <p className="text-sm font-medium capitalize mt-0.5">
                {data.platform_rankings[0].platform}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.platform_rankings[0].total_views.toLocaleString()} views
              </p>
            </div>
          )}
          {data.content_type_rankings.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground">Best Content Type</span>
              <p className="text-sm font-medium capitalize mt-0.5">
                {data.content_type_rankings[0].type}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.content_type_rankings[0].avg_engagement.toFixed(1)}% engagement
              </p>
            </div>
          )}
        </div>

        {/* Content Ideas */}
        {data.suggested_content_ideas.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Lightbulb className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-muted-foreground">Content Ideas</span>
            </div>
            <ul className="space-y-1">
              {data.suggested_content_ideas.map((idea, i) => (
                <li key={i} className="text-xs text-muted-foreground">&bull; {idea}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Hashtags */}
        {data.recommended_hashtags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Hash className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-muted-foreground">Recommended Hashtags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {data.recommended_hashtags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
