/**
 * Retry wrapper with exponential backoff.
 * Wraps external API calls (Whisper, Claude, storage) that may transiently fail.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number; label?: string } = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 1000, label = "operation" } = opts;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === attempts) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(`[retry] ${label} attempt ${attempt}/${attempts} failed, retrying in ${delay}ms:`, err instanceof Error ? err.message : err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error(`${label} failed after ${attempts} attempts`);
}
