import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-700 text-gray-300 border-transparent",
  review: "bg-yellow-600/20 text-yellow-400 border-transparent",
  approved: "bg-blue-600/20 text-blue-400 border-transparent",
  scheduling: "bg-purple-600/20 text-purple-400 border-transparent",
  publishing: "bg-purple-600/20 text-purple-400 border-transparent",
  published: "bg-green-600/20 text-green-400 border-transparent",
  failed: "bg-red-600/20 text-red-400 border-transparent",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status] || STATUS_STYLES.draft, className)}
    >
      {status}
    </Badge>
  );
}
