import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSocialAccounts } from "@/lib/opus-clip";

/**
 * GET /api/opus-clip/accounts
 *
 * List connected social accounts from Opus Clip.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const accounts = await getSocialAccounts();

    return NextResponse.json({ success: true, data: accounts });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to fetch social accounts",
      },
      { status: 500 }
    );
  }
}
