import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Workspace, WorkspaceSettings } from "@/lib/types";
import { parseJSON, stringifyJSON } from "@/lib/settings";

function toWorkspaceDTO(row: {
  id: string;
  name: string;
  activeFile: string | null;
  template: string;
  settings: string;
  createdAt: Date;
  updatedAt: Date;
}): Workspace {
  const settings = parseJSON<WorkspaceSettings>(row.settings, {});
  return {
    id: row.id,
    name: row.name,
    activeFile: row.activeFile,
    template: row.template,
    settings,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type Params = { params: Promise<{ id: string }> };

// GET /api/workspaces/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ws = await db.workspace.findUnique({ where: { id } });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  return NextResponse.json({ workspace: toWorkspaceDTO(ws) });
}

// PATCH /api/workspaces/[id]
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ws = await db.workspace.findUnique({ where: { id } });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: { name?: string; activeFile?: string | null; settings?: string } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body?.activeFile !== undefined) {
    data.activeFile = body.activeFile === null ? null : String(body.activeFile);
  }
  if (body?.settings !== undefined && body.settings !== null && typeof body.settings === "object") {
    const current = parseJSON<WorkspaceSettings>(ws.settings, {});
    const merged = { ...current, ...(body.settings as object) };
    data.settings = stringifyJSON(merged);
  }

  const updated = await db.workspace.update({ where: { id }, data });
  return NextResponse.json({ workspace: toWorkspaceDTO(updated) });
}

// DELETE /api/workspaces/[id]
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const ws = await db.workspace.findUnique({ where: { id } });
  if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  await db.workspace.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
