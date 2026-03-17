/**
 * API quota protection for external services.
 * Tracks daily usage per API and prevents exceeding safe limits.
 * Stores counts in Supabase app_settings to persist across serverless invocations.
 */

import { supabase } from "./supabase";

interface QuotaConfig {
  dailyLimit: number;
  label: string;
}

const QUOTA_CONFIGS: Record<string, QuotaConfig> = {
  whisper: { dailyLimit: 50, label: "OpenAI Whisper" },
  claude: { dailyLimit: 100, label: "Claude API" },
  youtube_upload: { dailyLimit: 10, label: "YouTube Upload" },
  meta_publish: { dailyLimit: 25, label: "Meta Graph API" },
  replicate: { dailyLimit: 30, label: "Replicate (Flux)" },
};

function getQuotaKey(api: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `quota_${api}_${today}`;
}

/**
 * Check if an API call is within quota limits.
 * Returns true if allowed, false if quota exceeded.
 */
export async function checkQuota(api: string): Promise<{ allowed: boolean; used: number; limit: number }> {
  const config = QUOTA_CONFIGS[api];
  if (!config) return { allowed: true, used: 0, limit: Infinity };

  const key = getQuotaKey(api);

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  const used = data?.value ? parseInt(data.value as string, 10) : 0;

  return {
    allowed: used < config.dailyLimit,
    used,
    limit: config.dailyLimit,
  };
}

/**
 * Increment the usage counter for an API.
 * Call this after a successful API call.
 */
export async function incrementQuota(api: string): Promise<void> {
  const key = getQuotaKey(api);

  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  const current = data?.value ? parseInt(data.value as string, 10) : 0;

  await supabase.from("app_settings").upsert({
    key,
    value: String(current + 1),
    updated_at: new Date().toISOString(),
  });
}

/**
 * Wrap an API call with quota protection.
 * Throws if quota exceeded; increments counter on success.
 */
export async function withQuota<T>(api: string, fn: () => Promise<T>): Promise<T> {
  const { allowed, used, limit } = await checkQuota(api);
  if (!allowed) {
    const config = QUOTA_CONFIGS[api];
    throw new Error(`${config?.label || api} daily quota exceeded (${used}/${limit}). Resets at midnight UTC.`);
  }

  const result = await fn();
  await incrementQuota(api);
  return result;
}
