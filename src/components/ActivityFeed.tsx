"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Download,
  Send,
  TrendingUp,
  AlertCircle,
  Sparkles,
  Eye,
  CheckCircle,
} from "lucide-react";

export interface ActivityItem {
  id: string;
  type: "import" | "publish" | "milestone" | "error" | "ai_copy" | "review" | "approved";
  title: string;
  description?: string;
  timestamp: string;
  link?: string;
}

const ACTIVITY_ICONS: Record<ActivityItem["type"], React.ReactNode> = {
  import: <Download className="w-4 h-4 text-blue-400" />,
  publish: <Send className="w-4 h-4 text-green-400" />,
  milestone: <TrendingUp className="w-4 h-4 text-yellow-400" />,
  error: <AlertCircle className="w-4 h-4 text-red-400" />,
  ai_copy: <Sparkles className="w-4 h-4 text-purple-400" />,
  review: <Eye className="w-4 h-4 text-orange-400" />,
  approved: <CheckCircle className="w-4 h-4 text-emerald-400" />,
};

const ACTIVITY_DOT_COLORS: Record<ActivityItem["type"], string> = {
  import: "bg-blue-400",
  publish: "bg-green-400",
  milestone: "bg-yellow-400",
  error: "bg-red-400",
  ai_copy: "bg-purple-400",
  review: "bg-orange-400",
  approved: "bg-emerald-400",
};

function relativeTime(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ActivityFeedProps {
  items: ActivityItem[];
  maxItems?: number;
  showViewAll?: boolean;
  viewAllHref?: string;
}

export default function ActivityFeed({
  items,
  maxItems = 10,
  showViewAll = true,
  viewAllHref = "/dashboard/content",
}: ActivityFeedProps) {
  const displayItems = items.slice(0, maxItems);

  if (displayItems.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No recent activity yet. Import some clips to get started.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {displayItems.map((item, i) => {
        const content = (
          <motion.div
            className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors cursor-pointer group"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
          >
            <div className="mt-0.5 shrink-0 relative">
              {ACTIVITY_ICONS[item.type]}
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${ACTIVITY_DOT_COLORS[item.type]} ring-2 ring-card`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                {item.title}
              </p>
              {item.description && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {item.description}
                </p>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground/60 shrink-0 mt-0.5">
              {relativeTime(item.timestamp)}
            </span>
          </motion.div>
        );

        return item.link ? (
          <Link key={item.id} href={item.link}>
            {content}
          </Link>
        ) : (
          <div key={item.id}>{content}</div>
        );
      })}

      {showViewAll && items.length > maxItems && (
        <Link
          href={viewAllHref}
          className="block text-center text-sm text-primary hover:text-primary/80 py-2 transition-colors"
        >
          View all activity
        </Link>
      )}
    </div>
  );
}
