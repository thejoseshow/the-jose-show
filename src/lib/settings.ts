import { supabase } from "./supabase";

export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) return null;

  // jsonb column: Supabase auto-deserializes, but legacy values may be
  // double-encoded strings from previous bug. Handle both cases.
  const raw = data.value;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as T;
    }
  }
  return raw as T;
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  await supabase
    .from("app_settings")
    .upsert({
      key,
      value, // jsonb column — pass native type directly
      updated_at: new Date().toISOString(),
    });
}
