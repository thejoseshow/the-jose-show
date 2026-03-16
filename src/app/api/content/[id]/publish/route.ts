import { NextRequest, NextResponse } from "next/server";
import { publishContent } from "@/lib/publish";
import { publishSchema, validateBody } from "@/lib/validation";

// POST /api/content/[id]/publish - Publish content to selected platforms
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate request body
  const body = await request.json().catch(() => ({}));
  const parsed = validateBody(publishSchema, body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error },
      { status: 400 }
    );
  }

  try {
    const result = await publishContent(id, parsed.data.platforms);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publishing failed";
    const status = message.includes("not found") || message.includes("not in publishable") ? 409 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
