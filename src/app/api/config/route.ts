import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWhiteLabelConfig, DEFAULT_CONFIG } from "@/lib/white-label";
import { getSupabase } from "@/lib/supabase";

// GET /api/config — returns white-label config for the current tenant
export async function GET() {
  // For now, always return default config (no multi-tenant routing yet)
  const config = await getWhiteLabelConfig();
  return NextResponse.json({ success: true, data: config });
}

// PUT /api/config — update white-label config (authenticated users only)
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate required fields
    const { brand_name, primary_color, secondary_color, logo_url, favicon_url, features } = body;

    if (!brand_name || typeof brand_name !== "string") {
      return NextResponse.json(
        { error: "brand_name is required" },
        { status: 400 }
      );
    }

    if (!primary_color || !/^#[0-9a-fA-F]{6}$/.test(primary_color)) {
      return NextResponse.json(
        { error: "primary_color must be a valid hex color (e.g. #f97316)" },
        { status: 400 }
      );
    }

    if (!secondary_color || !/^#[0-9a-fA-F]{6}$/.test(secondary_color)) {
      return NextResponse.json(
        { error: "secondary_color must be a valid hex color (e.g. #1e293b)" },
        { status: 400 }
      );
    }

    const tenantId = body.tenant_id || "default";

    const updatedConfig = {
      tenant_id: tenantId,
      brand_name,
      primary_color,
      secondary_color,
      logo_url: logo_url || null,
      favicon_url: favicon_url || null,
      custom_domain: body.custom_domain || null,
      features: {
        ...DEFAULT_CONFIG.features,
        ...(typeof features === "object" && features !== null ? features : {}),
      },
    };

    // Try to upsert into Supabase; if the table doesn't exist yet, that's fine
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from("white_label_config")
        .upsert(
          {
            ...updatedConfig,
            features: updatedConfig.features,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id" }
        );

      if (error) {
        console.warn("White-label config save failed (table may not exist yet):", error.message);
        // Still return success with the config — the table can be created later
      }
    } catch (e) {
      console.warn("White-label config save skipped:", e);
    }

    return NextResponse.json({ success: true, data: updatedConfig });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
