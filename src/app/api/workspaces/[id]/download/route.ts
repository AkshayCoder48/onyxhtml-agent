import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createWorkspaceZip, slugify } from "@/lib/zip";

type Params = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/download — returns a ZIP file
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ws = await db.workspace.findUnique({ where: { id } });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const files = await db.file.findMany({
    where: { workspaceId: id },
    orderBy: { path: "asc" },
  });

  // NEVER include API keys, chats, or app settings — only workspace files.
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
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
