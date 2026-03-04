import {
  addWeeks,
  addMonths,
  startOfDay,
  isBefore,
  isAfter,
  isEqual,
  getDay,
  getDate,
  setDate,
  format,
} from "date-fns";
import type { Event } from "./types";

// Day abbreviations for iCalendar BYDAY rules
const DAY_ABBR = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export interface RecurrencePreset {
  label: string;
  value: string;
}

export const RECURRENCE_PRESETS: RecurrencePreset[] = [
  { label: "Every week", value: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Every 2 weeks", value: "FREQ=WEEKLY;INTERVAL=2" },
  { label: "Monthly (same date)", value: "FREQ=MONTHLY;INTERVAL=1" },
  { label: "Monthly (same weekday)", value: "__MONTHLY_BY_DAY__" },
];

/**
 * Compute iCalendar BYDAY rule from a date.
 * e.g., 2nd Saturday → "FREQ=MONTHLY;BYDAY=2SA"
 */
export function buildMonthlyByDay(date: Date): string {
  const dayOfWeek = getDay(date); // 0=Sun .. 6=Sat
  const dayOfMonth = getDate(date);
  const weekNum = Math.ceil(dayOfMonth / 7);
  return `FREQ=MONTHLY;BYDAY=${weekNum}${DAY_ABBR[dayOfWeek]}`;
}

interface ParsedRule {
  freq: "WEEKLY" | "MONTHLY";
  interval: number;
  byday?: string; // e.g. "2SA"
}

function parseRule(rule: string): ParsedRule | null {
  const parts: Record<string, string> = {};
  for (const segment of rule.split(";")) {
    const [key, val] = segment.split("=");
    if (key && val) parts[key] = val;
  }

  const freq = parts.FREQ as ParsedRule["freq"];
  if (freq !== "WEEKLY" && freq !== "MONTHLY") return null;

  return {
    freq,
    interval: parseInt(parts.INTERVAL || "1", 10) || 1,
    byday: parts.BYDAY,
  };
}

/**
 * For MONTHLY;BYDAY=2SA style rules: find the Nth weekday in a given month.
 */
function findNthWeekdayInMonth(year: number, month: number, weekday: number, nth: number): Date {
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = getDay(firstOfMonth);
  // Days until the first occurrence of the target weekday
  let dayOffset = weekday - firstWeekday;
  if (dayOffset < 0) dayOffset += 7;
  const day = 1 + dayOffset + (nth - 1) * 7;
  return new Date(year, month, day);
}

/**
 * Expand a recurring event into individual instance dates within [rangeStart, rangeEnd].
 * Capped at 100 iterations to avoid runaway loops.
 */
export function expandRecurringEvent(event: Event, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!event.is_recurring || !event.recurrence_rule) return [];

  const rule = parseRule(event.recurrence_rule);
  if (!rule) return [];

  const instances: Date[] = [];
  const eventStart = startOfDay(new Date(event.start_date));
  const rangeStartDay = startOfDay(rangeStart);
  const rangeEndDay = startOfDay(rangeEnd);
  let iterations = 0;

  if (rule.freq === "WEEKLY") {
    let cursor = eventStart;
    while ((isBefore(cursor, rangeEndDay) || isEqual(cursor, rangeEndDay)) && iterations < 100) {
      if (isAfter(cursor, rangeStartDay) || isEqual(cursor, rangeStartDay)) {
        instances.push(cursor);
      }
      cursor = addWeeks(cursor, rule.interval);
      iterations++;
    }
  } else if (rule.freq === "MONTHLY") {
    if (rule.byday) {
      // BYDAY=2SA → nth=2, weekday=6 (Saturday)
      const match = rule.byday.match(/^(\d)(\w{2})$/);
      if (!match) return [];
      const nth = parseInt(match[1], 10);
      const weekday = DAY_ABBR.indexOf(match[2] as (typeof DAY_ABBR)[number]);
      if (weekday === -1) return [];

      // Start from the month of eventStart
      let year = eventStart.getFullYear();
      let month = eventStart.getMonth();

      while (iterations < 100) {
        const candidate = findNthWeekdayInMonth(year, month, weekday, nth);
        const candidateDay = startOfDay(candidate);

        if (isAfter(candidateDay, rangeEndDay)) break;

        if (
          (isAfter(candidateDay, rangeStartDay) || isEqual(candidateDay, rangeStartDay)) &&
          (isAfter(candidateDay, eventStart) || isEqual(candidateDay, eventStart))
        ) {
          instances.push(candidateDay);
        }

        month += rule.interval;
        if (month > 11) {
          year += Math.floor(month / 12);
          month = month % 12;
        }
        iterations++;
      }
    } else {
      // Monthly by date (same day of month)
      let cursor = eventStart;
      while ((isBefore(cursor, rangeEndDay) || isEqual(cursor, rangeEndDay)) && iterations < 100) {
        if (isAfter(cursor, rangeStartDay) || isEqual(cursor, rangeStartDay)) {
          instances.push(startOfDay(cursor));
        }
        cursor = addMonths(cursor, rule.interval);
        iterations++;
      }
    }
  }

  return instances;
}

/**
 * Get the next instance of a recurring event after a given date.
 * Returns null if no instance found within 365 days.
 */
export function getNextInstance(event: Event, after: Date): Date | null {
  if (!event.is_recurring || !event.recurrence_rule) return null;

  const rangeStart = after;
  const rangeEnd = new Date(after.getTime() + 365 * 24 * 60 * 60 * 1000);
  const instances = expandRecurringEvent(event, rangeStart, rangeEnd);

  const afterDay = startOfDay(after);
  for (const instance of instances) {
    if (isAfter(instance, afterDay)) return instance;
    // If it's the same day, check if the event time is still in the future
    if (isEqual(instance, afterDay)) {
      const eventTime = new Date(event.start_date);
      const instanceWithTime = new Date(instance);
      instanceWithTime.setHours(eventTime.getHours(), eventTime.getMinutes());
      if (isAfter(instanceWithTime, after)) return instance;
    }
  }

  return null;
}
