import { NextRequest, NextResponse } from "next/server";
import { generatePlatformCopy } from "@/lib/claude";
import { generateSchema, sanitizeError, validateBody } from "@/lib/validation";
import type { Platform } from "@/lib/types";

// POST /api/pipeline/generate - Generate platform copy from transcript
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(generateSchema, body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error, details: parsed.details },
      { status: 400 }
    );
  }

  try {
    const copy = await generatePlatformCopy(
      parsed.data.transcript,
      parsed.data.title,
      (parsed.data.platforms as Platform[]) || ["youtube", "facebook", "instagram", "tiktok"],
      parsed.data.is_spanish ?? false
    );

    return NextResponse.json({ success: true, data: copy });
  } catch (err) {
    const msg = sanitizeError(err, "pipeline:generate");
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
