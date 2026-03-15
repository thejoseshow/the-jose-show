import { supabase } from "./supabase";

export async function getAppSetting<T = unknown>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) return null;
  return data.value as T;
}

export async function setAppSetting(key: string, value: unknown): Promise<void> {
  await supabase
    .from("app_settings")
    .upsert({
      key,
      value: JSON.stringify(value),
      updated_at: new Date().toISOString(),
    });
}
