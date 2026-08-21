import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { safePath } from "@/lib/files";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const from = safePath(String(body?.from ?? ""));
    const to = safePath(String(body?.to ?? ""));
    if (!from || !to) {
      return NextResponse.json({ error: "Invalid 'from' or 'to' path" }, { status: 400 });
    }
    if (from === to) {
      return NextResponse.json({ error: "Source and destination are the same" }, { status: 400 });
    }

    const existing = await db.file.findUnique({
      where: { workspaceId_path: { workspaceId: id, path: from } },
    });
    const children = await db.file.findMany({
      where: { workspaceId: id, path: { startsWith: from + "/" } },
    });
    if (!existing && children.length === 0) {
      return NextResponse.json({ error: `File or folder not found: ${from}` }, { status: 404 });
    }
    const destExists = await db.file.findUnique({
      where: { workspaceId_path: { workspaceId: id, path: to } },
    });
    if (destExists) {
      return NextResponse.json({ error: `Destination already exists: ${to}` }, { status: 409 });
    }

    let renamedFileId: string | null = null;
    // Use transaction if possible, fallback to sequential
    try {
      await db.$transaction(async (tx) => {
        if (existing) {
          const updated = await tx.file.update({
            where: { id: existing.id },
            data: { path: to },
          });
          renamedFileId = updated.id;
        }
        for (const child of children) {
          const newChildPath = to + child.path.slice(from.length);
          await tx.file.update({
            where: { id: child.id },
            data: { path: newChildPath },
          });
        }
      });
    } catch {
      // Fallback without transaction
      if (existing) {
        const updated = await db.file.update({ where: { id: existing.id }, data: { path: to } });
        renamedFileId = updated.id;
      }
      for (const child of children) {
        const newChildPath = to + child.path.slice(from.length);
        try {
          await db.file.update({ where: { id: child.id }, data: { path: newChildPath } });
        } catch {}
      }
    }

    try {
      await db.workspace.update({ where: { id }, data: { updatedAt: new Date() } });
    } catch {}

    if (renamedFileId) {
      const f = await db.file.findUnique({ where: { id: renamedFileId } });
      if (f) {
        return NextResponse.json({
          file: {
            id: f.id,
            workspaceId: f.workspaceId,
            path: f.path,
            content: f.content,
            isBinary: f.isBinary,
            updatedAt: f.updatedAt.toISOString(),
          },
        });
      }
    }
    const anyFile = await db.file.findFirst({
      where: { workspaceId: id, path: { startsWith: to } },
    });
    if (anyFile) {
      return NextResponse.json({
        file: {
          id: anyFile.id,
          workspaceId: anyFile.workspaceId,
          path: anyFile.path,
          content: anyFile.content,
          isBinary: anyFile.isBinary,
          updatedAt: anyFile.updatedAt.toISOString(),
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST /api/workspaces/[id]/files/rename error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
