import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractZip, slugify } from "@/lib/zip";
import { Workspace, WorkspaceSettings } from "@/lib/types";
import { parseJSON, stringifyJSON } from "@/lib/settings";

type Params = { params: Promise<{ id: string }> };

// POST /api/workspaces/[id]/import — import a ZIP into a NEW workspace.
// The route path includes [id] for consistency with the rest of the API,
// but the id is ignored (a new workspace is always created).
// We accept the file as multipart form data (field "file").
export async function POST(req: NextRequest, { params }: Params) {
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
  // Reject oversized imports (50 MB)
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

  // Derive workspace name from the file name (without extension)
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

  // Limit to 2000 files for safety
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
}
