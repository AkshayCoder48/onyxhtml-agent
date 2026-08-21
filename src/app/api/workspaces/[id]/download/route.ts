import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { createWorkspaceZip, slugify } from "@/lib/zip";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const ws = await db.workspace.findUnique({ where: { id } });
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const files = await db.file.findMany({
      where: { workspaceId: id },
      orderBy: { path: "asc" },
    });

    const zipFiles = files.map((f) => ({
      path: f.path,
      content: f.content,
      isBinary: f.isBinary,
    }));

    const folderName = slugify(ws.name);
    const buffer = await createWorkspaceZip(folderName, zipFiles);

    const filename = `${folderName}.zip`;
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename=\"${filename}\"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (e) {
    console.error('GET /api/workspaces/[id]/download error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
