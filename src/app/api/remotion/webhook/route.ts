import { NextRequest, NextResponse } from "next/server";
import { validateWebhookSignature } from "@remotion/lambda/client";
import { handleRenderComplete, handleRenderFailed } from "@/lib/remotion";

// POST /api/remotion/webhook - Receive Remotion Lambda render completion
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Verify webhook signature if secret is configured
    const secret = process.env.REMOTION_WEBHOOK_SECRET;
    if (secret) {
      const signature = request.headers.get("x-remotion-signature");
      if (!signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      try {
        validateWebhookSignature({
          secret,
          body,
          signatureHeader: signature,
        });
      } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const { type, renderId, outputUrl, customData, errors } = body;
    const jobId = customData?.jobId;
    const contentId = customData?.contentId || null;

    if (!jobId) {
      console.error("[remotion-webhook] Missing jobId in customData");
      return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
    }

    if (type === "success" && outputUrl) {
      await handleRenderComplete({ jobId, contentId, outputUrl });
      console.log(`[remotion-webhook] Render ${renderId} completed: ${outputUrl}`);
    } else if (type === "error" || type === "timeout") {
      const errorMsg = errors?.map((e: { message: string }) => e.message).join("; ") || `Render ${type}`;
      await handleRenderFailed({ jobId, errorMessage: errorMsg });
      console.error(`[remotion-webhook] Render ${renderId} failed: ${errorMsg}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[remotion-webhook] Error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
