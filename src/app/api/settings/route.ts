import { NextRequest, NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/db";
import { getSettings, saveSettings } from "@/lib/settings";
import { AppSettings } from "@/lib/types";

export async function GET() {
  try {
    await ensureDbInitialized();
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (e) {
    console.error('GET /api/settings error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureDbInitialized();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
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
      "previewRefreshBehavior",
      "autoReload",
      "consoleVisible",
      "errorOverlay",
      "openLinksExternally",
    ];
    const patch: Partial<AppSettings> = {};
    for (const k of allowed) {
      if (body[k] !== undefined) {
        patch[k] = body[k];
      }
    }
    const settings = await saveSettings(patch);
    return NextResponse.json({ settings });
  } catch (e) {
    console.error('PATCH /api/settings error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
