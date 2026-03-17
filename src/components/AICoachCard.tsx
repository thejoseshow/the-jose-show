"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw, Loader2, Lightbulb, TrendingUp, Hash } from "lucide-react";
import type { PerformanceInsight } from "@/lib/types";

export default function AICoachCard() {
  const [insight, setInsight] = useState<PerformanceInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success && data.data) {
        // Wrap on-demand result in insight-like shape
        setInsight({
          id: "on-demand",
          week_start: new Date().toISOString().split("T")[0],
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <CardTitle className="text-base">AI Coach — Week of {weekLabel}</CardTitle>
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
              {data.top_insights.map((insight, i) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-muted-foreground shrink-0">&bull;</span>
                  <span>{insight}</span>
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
