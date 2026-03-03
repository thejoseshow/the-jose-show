"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TokenStatus {
  platform: string;
  connected: boolean;
  expires_at: string | null;
  days_until_expiry: number | null;
}

export default function PlatformHealth() {
  const [tokens, setTokens] = useState<TokenStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/analytics?health=true");
        const data = await res.json();
        if (data.success) setTokens(data.data || []);
      } catch {
        // Silently fail - not critical
      }
      setLoading(false);
    }
    load();
  }, []);

  const platforms = [
    { id: "google", label: "Google (Drive + YouTube)" },
    { id: "facebook", label: "Facebook + Instagram" },
    { id: "tiktok", label: "TikTok" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Platform Connections</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading
          ? platforms.map((p) => (
              <div key={p.id} className="h-5 bg-muted rounded animate-pulse" />
            ))
          : platforms.map((p) => {
              const token = tokens.find((t) => t.platform === p.id);
              const connected = !!token?.connected;
              const expiring =
                token?.days_until_expiry !== null &&
                token?.days_until_expiry !== undefined &&
                token.days_until_expiry < 7;

              return (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{p.label}</span>
                  <Badge
                    variant="outline"
                    className={
                      connected
                        ? expiring
                          ? "border-yellow-500/50 text-yellow-400 bg-yellow-600/10"
                          : "border-green-500/50 text-green-400 bg-green-600/10"
                        : "border-transparent text-muted-foreground bg-muted"
                    }
                  >
                    <span
                      className={`mr-1.5 inline-block w-2 h-2 rounded-full ${
                        connected
                          ? expiring
                            ? "bg-yellow-400"
                            : "bg-green-400"
                          : "bg-gray-600"
                      }`}
                    />
                    {connected
                      ? expiring
                        ? `Expires ${token.days_until_expiry}d`
                        : "Connected"
                      : "Not connected"}
                  </Badge>
                </div>
              );
            })}
      </CardContent>
    </Card>
  );
}
