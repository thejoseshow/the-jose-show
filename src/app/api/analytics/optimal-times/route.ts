import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOptimalPostingTimes } from "@/lib/optimal-times";

export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const times = await getOptimalPostingTimes();
    return NextResponse.json({ success: true, data: times });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to get optimal times";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
