import { NextRequest, NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/settings";
import { AppSettings } from "@/lib/types";

// GET /api/settings
export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ settings });
}

// PATCH /api/settings body Partial<AppSettings>
export async function PATCH(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  // Only forward known keys
  const allowed: (keyof AppSettings)[] = [
    "theme",
    "fontSize",
    "tabSize",
    "wordWrap",
    "minimap",
    "lineNumbers",
    "autoSave",
    "formatOnSave",
    "defaultViewport",
    "autoReload",
    "consoleVisible",
    "errorOverlay",
    "openLinksExternally",
  ];
  const patch: Partial<AppSettings> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) {
      // @ts-expect-error dynamic assignment
      patch[k] = body[k];
    }
  }
  const settings = await saveSettings(patch);
  return NextResponse.json({ settings });
}
