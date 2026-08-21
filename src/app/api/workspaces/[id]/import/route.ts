import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { extractZip, slugify } from "@/lib/zip";
import { Workspace, WorkspaceSettings } from "@/lib/types";
import { parseJSON, stringifyJSON } from "@/lib/settings";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    void params;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file" }, { status: 400 });
    }
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 50MB)" }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    let entries: { path: string; content: string; isBinary: boolean }[];
    try {
      entries = await extractZip(buf);
    } catch (e) {
      return NextResponse.json(
        { error: `Failed to read ZIP: ${e instanceof Error ? e.message : String(e)}` },
        { status: 400 }
      );
    }
    if (entries.length === 0) {
      return NextResponse.json({ error: "ZIP contains no importable files" }, { status: 400 });
    }

    const rawName = file.name.replace(/\.zip$/i, "").replace(/[\\/:*?"<>|]+/g, "-").trim();
    const name = rawName || "Imported Workspace";

    const ws = await db.workspace.create({
      data: {
        name,
        template: "blank",
        activeFile: entries.some((e) => e.path === "index.html")
          ? "index.html"
          : (entries[0]?.path ?? null),
        settings: stringifyJSON({}),
      },
    });

    const safe = entries.slice(0, 2000);
    await db.file.createMany({
      data: safe.map((e) => ({
        workspaceId: ws.id,
        path: e.path,
        content: e.content,
        isBinary: e.isBinary,
      })),
    });

    const fresh = await db.workspace.findUnique({ where: { id: ws.id } });
    const settings = parseJSON<WorkspaceSettings>(fresh!.settings, {});
    const workspace: Workspace = {
      id: fresh!.id,
      name: fresh!.name,
      activeFile: fresh!.activeFile,
      template: fresh!.template,
      settings,
      createdAt: fresh!.createdAt.toISOString(),
      updatedAt: fresh!.updatedAt.toISOString(),
    };
    void slugify;
    return NextResponse.json({ workspace });
  } catch (e) {
    console.error('POST /api/workspaces/[id]/import error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
