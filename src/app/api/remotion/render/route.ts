import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { triggerRender } from "@/lib/remotion";
import { validateBody, sanitizeError } from "@/lib/validation";
import { renderRequestSchema } from "@/lib/validation";
import type { CompositionId } from "@/lib/types";

// POST /api/remotion/render - Trigger a Remotion Lambda render
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateBody(renderRequestSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: validation.error, details: validation.details },
        { status: 400 }
      );
    }

    const { composition_id, content_id, input_props } = validation.data;

    const job = await triggerRender({
      compositionId: composition_id as CompositionId,
      inputProps: input_props,
      contentId: content_id,
    });

    return NextResponse.json({ success: true, data: job });
  } catch (err) {
    const msg = sanitizeError(err, "remotion-render");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
