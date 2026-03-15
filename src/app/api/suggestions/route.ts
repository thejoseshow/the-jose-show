import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBestPostingTimes, getContentSuggestions } from "@/lib/ai-suggestions";

// GET /api/suggestions - AI-powered posting time + content suggestions
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [postingTimes, contentIdeas] = await Promise.all([
      getBestPostingTimes(),
      getContentSuggestions(),
    ]);

    return NextResponse.json({
      success: true,
      data: { posting_times: postingTimes, content_ideas: contentIdeas },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
