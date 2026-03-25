"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { getNavItems } from "@/lib/constants";
import { useWhiteLabel } from "@/components/WhiteLabelProvider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion } from "framer-motion";
import {
  Home,
  Video,
  CalendarDays,
  Sparkles,
  FileText,
  Download,
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
  fileText: <FileText className="w-5 h-5" />,
  import: <Download className="w-5 h-5" />,
  upload: <Upload className="w-5 h-5" />,
  chart: <BarChart3 className="w-5 h-5" />,
  settings: <Settings className="w-5 h-5" />,
};

// Static badge count for Import (will be dynamic in future)
const BADGE_COUNTS: Record<string, number> = {
  "/dashboard/import": 3,
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { config } = useWhiteLabel();

  const navItems = getNavItems(config.features);

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-border">
        {config.logo_url ? (
          <Image
            src={config.logo_url}
            alt={config.brand_name}
            width={160}
            height={40}
            className="h-8 w-auto object-contain"
          />
        ) : (
          <h1 className="text-xl font-bold text-white">{config.brand_name}</h1>
        )}
        <p className="text-xs text-muted-foreground mt-1">Content Dashboard</p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          const badgeCount = BADGE_COUNTS[item.href];

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-red-400"
                      : "text-muted-foreground hover:text-white hover:bg-accent"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active"
                      className="absolute inset-0 bg-red-600/15 border border-red-600/20 rounded-lg"
                      transition={{ type: "spring", stiffness: 350, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-3 w-full">
                    {ICONS[item.icon]}
                    {item.label}
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span className="ml-auto bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                        {badgeCount}
                      </span>
                    )}
                  </span>
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
