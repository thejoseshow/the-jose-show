import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/opus-clip/accounts
 *
 * List connected platform accounts from our system.
 * (We no longer use Opus Clip's social account connections — we use our own.)
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: tokens } = await supabase
      .from("platform_tokens")
      .select("platform, updated_at");

    const accounts = (tokens || []).map((t) => ({
      platform: t.platform,
      connected: true,
      lastUpdated: t.updated_at,
    }));

    return NextResponse.json({ success: true, data: accounts });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch accounts",
      },
      { status: 500 }
    );
  }
}
