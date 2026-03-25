import { NextRequest, NextResponse } from "next/server";
import { handleOpusClipComplete, verifyWebhookSecret } from "@/lib/opus-clip";

export const maxDuration = 300; // 5 min — clip processing can take a while

/**
 * POST /api/webhooks/opus-clip
 *
 * Incoming webhook from Zapier when an Opus Clip project completes.
 * This is "Path A" — Zapier sends clip data directly to our app.
 *
 * Zapier zap setup:
 *   Trigger: "New Project Completed" in Opus Clip
 *   Action: "Get Clips" in Opus Clip
 *   Action: Webhook POST to this endpoint with clip data
 *
 * Optional security: pass ?secret=YOUR_SECRET as query param
 * or set x-webhook-secret header. Must match ZAPIER_WEBHOOK_SECRET env var.
 */
export async function POST(request: NextRequest) {
  // Verify webhook secret (optional — if ZAPIER_WEBHOOK_SECRET is set)
  const secretFromQuery = request.nextUrl.searchParams.get("secret");
  const secretFromHeader = request.headers.get("x-webhook-secret");
  const secret = secretFromQuery || secretFromHeader;

  if (!verifyWebhookSecret(secret)) {
    return NextResponse.json(
      { error: "Invalid webhook secret" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    console.log("[webhook:opus-clip] Received webhook:", JSON.stringify(body).slice(0, 500));

    const result = await handleOpusClipComplete(body);

    return NextResponse.json({
      success: true,
      projectId: result.projectId,
      clipsProcessed: result.totalClips,
      contentCreated: result.totalScheduled,
      contentIds: result.contentIds,
      errors: result.errors,
    });
  } catch (err) {
    console.error("[webhook:opus-clip] Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Webhook processing failed",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/opus-clip
 *
 * Health check endpoint. Zapier sometimes pings GET to verify the webhook URL.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "The Jose Show - Opus Clip Webhook",
    timestamp: new Date().toISOString(),
  });
}
