"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NAV_ITEMS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Home,
  Video,
  CalendarDays,
  Sparkles,
  Upload,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";

const ICONS: Record<string, React.ReactNode> = {
  home: <Home className="w-5 h-5" />,
  film: <Video className="w-5 h-5" />,
  calendar: <CalendarDays className="w-5 h-5" />,
  sparkles: <Sparkles className="w-5 h-5" />,
  upload: <Upload className="w-5 h-5" />,
  chart: <BarChart3 className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-bold text-white">The Jose Show</h1>
        <p className="text-xs text-muted-foreground mt-1">Content Dashboard</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-red-600/20 text-red-400"
                      : "text-muted-foreground hover:text-white hover:bg-accent"
                  }`}
                >
                  {ICONS[item.icon]}
                  {item.label}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <Separator />

      <div className="p-4">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-muted-foreground hover:text-white"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
