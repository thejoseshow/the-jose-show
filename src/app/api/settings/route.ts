import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

// GET /api/settings - Return all app settings
export async function GET() {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Convert rows to a key-value object
  const settings: Record<string, unknown> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  return NextResponse.json({ success: true, data: settings });
}

// PATCH /api/settings - Update settings
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    for (const [key, value] of Object.entries(body)) {
      await supabase
        .from("app_settings")
        .upsert({
          key,
          value: JSON.stringify(value),
          updated_at: new Date().toISOString(),
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
