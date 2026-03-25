/**
 * One-time cleanup script: fix stuck database records in Supabase
 *
 * Run with: npx tsx scripts/fix-stuck-records.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local manually (no dotenv dependency needed)
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex);
  let value = trimmed.slice(eqIndex + 1);
  // Strip surrounding quotes
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("=== Fix Stuck Records Script ===\n");

  // ---------------------------------------------------------------
  // 1. Videos stuck in "transcribing" with retry_count=1 -> reset retry_count to 0
  // ---------------------------------------------------------------
  console.log("--- Step 1: Reset 4 videos stuck in 'transcribing' (retry_count 1 -> 0) ---");

  const { data: transcribingVideos, error: e1 } = await supabase
    .from("videos")
    .select("id, filename, status, retry_count")
    .eq("status", "transcribing")
    .eq("retry_count", 1);

  if (e1) {
    console.error("  Error fetching transcribing videos:", e1.message);
  } else {
    console.log(`  Found ${transcribingVideos?.length ?? 0} videos stuck in 'transcribing' with retry_count=1`);
    for (const v of transcribingVideos ?? []) {
      console.log(`  -> Resetting retry_count for video ${v.id} (${v.filename})`);
    }

    if (transcribingVideos && transcribingVideos.length > 0) {
      const ids = transcribingVideos.map((v) => v.id);
      const { error: updateErr } = await supabase
        .from("videos")
        .update({ retry_count: 0, updated_at: new Date().toISOString() })
        .in("id", ids);

      if (updateErr) {
        console.error("  Error updating:", updateErr.message);
      } else {
        console.log(`  Updated ${ids.length} videos.\n`);
      }
    } else {
      console.log("  Nothing to update.\n");
    }
  }

  // ---------------------------------------------------------------
  // 2. Videos stuck in "clipping" -> reset status to "transcribed"
  // ---------------------------------------------------------------
  console.log("--- Step 2: Reset 4 videos stuck in 'clipping' -> 'transcribed' ---");

  const { data: clippingVideos, error: e2 } = await supabase
    .from("videos")
    .select("id, filename, status")
    .eq("status", "clipping");

  if (e2) {
    console.error("  Error fetching clipping videos:", e2.message);
  } else {
    console.log(`  Found ${clippingVideos?.length ?? 0} videos stuck in 'clipping'`);
    for (const v of clippingVideos ?? []) {
      console.log(`  -> Resetting video ${v.id} (${v.filename}) to 'transcribed'`);
    }

    if (clippingVideos && clippingVideos.length > 0) {
      const ids = clippingVideos.map((v) => v.id);
      const { error: updateErr } = await supabase
        .from("videos")
        .update({ status: "transcribed", updated_at: new Date().toISOString() })
        .in("id", ids);

      if (updateErr) {
        console.error("  Error updating:", updateErr.message);
      } else {
        console.log(`  Updated ${ids.length} videos.\n`);
      }
    } else {
      console.log("  Nothing to update.\n");
    }
  }

  // ---------------------------------------------------------------
  // 3. Content stuck in "publishing" -> check publish_log for each
  // ---------------------------------------------------------------
  console.log("--- Step 3: Fix 7 content pieces stuck in 'publishing' ---");

  const { data: publishingContent, error: e3 } = await supabase
    .from("content")
    .select("id, title, status")
    .eq("status", "publishing");

  if (e3) {
    console.error("  Error fetching publishing content:", e3.message);
  } else {
    console.log(`  Found ${publishingContent?.length ?? 0} content pieces stuck in 'publishing'`);

    for (const c of publishingContent ?? []) {
      // Check publish_log for this content
      const { data: logs, error: logErr } = await supabase
        .from("publish_log")
        .select("id, platform, status")
        .eq("content_id", c.id);

      if (logErr) {
        console.error(`  Error fetching publish_log for ${c.id}:`, logErr.message);
        continue;
      }

      const successCount = (logs ?? []).filter((l) => l.status === "success").length;
      const totalCount = (logs ?? []).length;

      if (successCount > 0) {
        // At least one platform published successfully
        console.log(
          `  -> Content ${c.id} ("${c.title}"): ${successCount}/${totalCount} platforms succeeded -> setting 'published'`
        );
        const { error: updateErr } = await supabase
          .from("content")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id);

        if (updateErr) {
          console.error("    Error updating:", updateErr.message);
        }
      } else {
        // No platforms succeeded
        console.log(
          `  -> Content ${c.id} ("${c.title}"): 0/${totalCount} platforms succeeded -> setting 'approved' for retry`
        );
        const { error: updateErr } = await supabase
          .from("content")
          .update({
            status: "approved",
            updated_at: new Date().toISOString(),
          })
          .eq("id", c.id);

        if (updateErr) {
          console.error("    Error updating:", updateErr.message);
        }
      }
    }
    console.log();
  }

  // ---------------------------------------------------------------
  // 4. Render jobs stuck in "rendering" with progress=0 -> mark failed
  // ---------------------------------------------------------------
  console.log('--- Step 4: Fail 2 render_jobs stuck in "rendering" with progress=0 ---');

  const { data: stuckRenders, error: e4 } = await supabase
    .from("render_jobs")
    .select("id, composition_id, status, progress")
    .eq("status", "rendering")
    .eq("progress", 0);

  if (e4) {
    console.error("  Error fetching stuck render_jobs:", e4.message);
  } else {
    console.log(`  Found ${stuckRenders?.length ?? 0} render_jobs stuck in 'rendering' with progress=0`);
    for (const r of stuckRenders ?? []) {
      console.log(`  -> Failing render_job ${r.id} (${r.composition_id})`);
    }

    if (stuckRenders && stuckRenders.length > 0) {
      const ids = stuckRenders.map((r) => r.id);
      const { error: updateErr } = await supabase
        .from("render_jobs")
        .update({
          status: "failed",
          error_message: "Lambda timeout - never received webhook callback",
          updated_at: new Date().toISOString(),
        })
        .in("id", ids);

      if (updateErr) {
        console.error("  Error updating:", updateErr.message);
      } else {
        console.log(`  Updated ${ids.length} render_jobs.\n`);
      }
    } else {
      console.log("  Nothing to update.\n");
    }
  }

  // ---------------------------------------------------------------
  // 5. Approved content with scheduled_at=null -> just report (no action)
  // ---------------------------------------------------------------
  console.log("--- Step 5: Report 5 approved content pieces with scheduled_at=null ---");

  const { data: unscheduledContent, error: e5 } = await supabase
    .from("content")
    .select("id, title, status, scheduled_at")
    .eq("status", "approved")
    .is("scheduled_at", null);

  if (e5) {
    console.error("  Error fetching unscheduled approved content:", e5.message);
  } else {
    console.log(`  Found ${unscheduledContent?.length ?? 0} approved content pieces with scheduled_at=null`);
    for (const c of unscheduledContent ?? []) {
      console.log(`  -> Content ${c.id} ("${c.title}") - leaving as approved (publish cron will handle)`);
    }
    console.log();
  }

  console.log("=== Done ===");
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
