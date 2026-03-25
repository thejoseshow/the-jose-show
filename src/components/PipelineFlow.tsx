"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Download, Sparkles, Eye, CalendarClock, Send } from "lucide-react";

interface PipelineStep {
  label: string;
  count: number;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: React.ReactNode;
  href: string;
}

interface PipelineFlowProps {
  steps: PipelineStep[];
}

const DEFAULT_STEPS: Omit<PipelineStep, "count">[] = [
  {
    label: "Import",
    color: "text-gray-300",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
    icon: <Download className="w-5 h-5" />,
    href: "/dashboard/import",
  },
  {
    label: "AI Copy",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    icon: <Sparkles className="w-5 h-5" />,
    href: "/dashboard/content",
  },
  {
    label: "Review",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    icon: <Eye className="w-5 h-5" />,
    href: "/dashboard/content?status=review",
  },
  {
    label: "Scheduled",
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    icon: <CalendarClock className="w-5 h-5" />,
    href: "/dashboard/calendar",
  },
  {
    label: "Published",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    icon: <Send className="w-5 h-5" />,
    href: "/dashboard/analytics",
  },
];

export function getDefaultSteps() {
  return DEFAULT_STEPS;
}

export default function PipelineFlow({ steps }: PipelineFlowProps) {
  const router = useRouter();

  return (
    <div className="w-full">
      {/* Desktop: horizontal */}
      <div className="hidden md:flex items-center justify-between gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center flex-1">
            <motion.button
              onClick={() => router.push(step.href)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border ${step.bgColor} ${step.borderColor} cursor-pointer w-full group`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
            >
              <div className={`${step.color} transition-colors`}>
                {step.icon}
              </div>
              <span className={`text-xs font-medium ${step.color}`}>{step.label}</span>
              <motion.span
                className="text-2xl font-bold text-foreground"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1 + 0.3, type: "spring", stiffness: 200 }}
              >
                {step.count}
              </motion.span>
            </motion.button>
            {i < steps.length - 1 && (
              <div className="flex items-center px-1 shrink-0">
                <motion.div
                  className="h-0.5 w-6 bg-gradient-to-r from-muted-foreground/30 to-muted-foreground/10"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: i * 0.1 + 0.2, duration: 0.3 }}
                />
                <motion.div
                  className="w-0 h-0 border-t-[4px] border-t-transparent border-b-[4px] border-b-transparent border-l-[6px] border-l-muted-foreground/30"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.1 + 0.4 }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile: vertical */}
      <div className="flex md:hidden flex-col gap-2">
        {steps.map((step, i) => (
          <motion.button
            key={step.label}
            onClick={() => router.push(step.href)}
            className={`flex items-center gap-4 p-3 rounded-xl border ${step.bgColor} ${step.borderColor} cursor-pointer w-full text-left`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            whileTap={{ scale: 0.97 }}
          >
            <div className={`${step.color}`}>{step.icon}</div>
            <span className={`text-sm font-medium ${step.color} flex-1`}>{step.label}</span>
            <span className="text-xl font-bold text-foreground">{step.count}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
