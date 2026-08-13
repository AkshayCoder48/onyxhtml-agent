import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildFileTree, safePath } from "@/lib/files";

type Params = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]/files
//   - with ?path=<path> → single file (404 if not found)
//   - without path → { files: [...], tree: [...] }
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const singlePath = url.searchParams.get("path");

  if (singlePath !== null) {
    const path = safePath(singlePath);
    if (!path) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const file = await db.file.findUnique({
      where: { workspaceId_path: { workspaceId: id, path } },
    });
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
    return NextResponse.json({
      file: {
        id: file.id,
        workspaceId: file.workspaceId,
        path: file.path,
        content: file.content,
        isBinary: file.isBinary,
        updatedAt: file.updatedAt.toISOString(),
      },
    });
  }

  // List all
  const files = await db.file.findMany({
    where: { workspaceId: id },
    orderBy: { path: "asc" },
  });
  const paths = files.map((f) => f.path);
  const tree = buildFileTree(paths);
  return NextResponse.json({
    files: files.map((f) => ({
      path: f.path,
      content: f.content,
      isBinary: f.isBinary,
    })),
    tree,
  });
}

// POST /api/workspaces/[id]/files — create file (upsert on [workspaceId, path])
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const rawPath = typeof body?.path === "string" ? body.path : "";
  const path = safePath(rawPath);
  if (!path) {
    return NextResponse.json({ error: "Invalid or missing path" }, { status: 400 });
  }
  const content = typeof body?.content === "string" ? body.content : "";
  const isBinary = Boolean(body?.isBinary);

  const file = await db.file.upsert({
    where: { workspaceId_path: { workspaceId: id, path } },
    update: { content, isBinary },
    create: { workspaceId: id, path, content, isBinary },
  });

  // Bump workspace updatedAt
  await db.workspace.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json({
    file: {
      id: file.id,
      workspaceId: file.workspaceId,
      path: file.path,
      content: file.content,
      isBinary: file.isBinary,
      updatedAt: file.updatedAt.toISOString(),
    },
  });
}

// PUT /api/workspaces/[id]/files?path=<path> — overwrite content
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return NextResponse.json({ error: "Missing ?path= query" }, { status: 400 });
  }
  const path = safePath(rawPath);
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const content = typeof body?.content === "string" ? body.content : "";

  const existing = await db.file.findUnique({
    where: { workspaceId_path: { workspaceId: id, path } },
  });
  if (!existing) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const file = await db.file.update({
    where: { id: existing.id },
    data: { content },
  });

  // Bump workspace updatedAt (auto-save triggers preview reload)
  await db.workspace.update({ where: { id }, data: { updatedAt: new Date() } });

  return NextResponse.json({
    file: {
      id: file.id,
      workspaceId: file.workspaceId,
      path: file.path,
      content: file.content,
      isBinary: file.isBinary,
      updatedAt: file.updatedAt.toISOString(),
    },
  });
}

// DELETE /api/workspaces/[id]/files?path=<path> — delete file (and children if folder)
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return NextResponse.json({ error: "Missing ?path= query" }, { status: 400 });
  }
  const path = safePath(rawPath);
  if (!path) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const prefix = path.endsWith("/") ? path : path + "/";
  await db.file.deleteMany({
    where: {
      workspaceId: id,
      OR: [{ path }, { path: { startsWith: prefix } }],
    },
  });
  await db.workspace.update({ where: { id }, data: { updatedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
