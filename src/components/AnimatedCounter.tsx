"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate, useInView } from "framer-motion";

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  formatter?: (n: number) => string;
}

function defaultFormatter(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString();
}

export default function AnimatedCounter({
  value,
  duration = 1000,
  prefix = "",
  suffix = "",
  className = "",
  formatter,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(0);
  const isInView = useInView(ref, { once: true });
  const fmt = formatter || defaultFormatter;

  const display = useTransform(motionValue, (v) => `${prefix}${fmt(v)}${suffix}`);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(motionValue, value, {
      duration: duration / 1000,
      ease: "easeOut",
    });
    return controls.stop;
  }, [isInView, value, duration, motionValue]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
