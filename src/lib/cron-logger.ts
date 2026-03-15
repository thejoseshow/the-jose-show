import { supabase } from "./supabase";

/**
 * Wraps a cron handler with start/end logging to the cron_log table.
 * Returns the handler result and logs duration, status, and any errors.
 */
export async function withCronLog<T>(
  cronName: string,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();

  // Insert start record
  const { data: logRow } = await supabase
    .from("cron_log")
    .insert({ cron_name: cronName, started_at: startedAt.toISOString() })
    .select("id")
    .single();

  const logId = logRow?.id;

  try {
    const result = await fn();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();

    if (logId) {
      await supabase
        .from("cron_log")
        .update({
          status: "success",
          finished_at: finishedAt.toISOString(),
          duration_ms: durationMs,
          result: result as unknown as Record<string, unknown>,
        })
        .eq("id", logId);
    }

    return result;
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (logId) {
      await supabase
        .from("cron_log")
        .update({
          status: "error",
          finished_at: finishedAt.toISOString(),
          duration_ms: durationMs,
          error_message: errorMessage,
        })
        .eq("id", logId);
    }

    throw err;
  }
}
