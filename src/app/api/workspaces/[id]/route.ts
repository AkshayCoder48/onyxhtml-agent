import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { Workspace, WorkspaceSettings } from "@/lib/types";
import { parseJSON, stringifyJSON } from "@/lib/settings";
import { AGENT_MD_CONTENT, AGENT_MD_FILENAME } from "@/lib/agent-md";

async function ensureAgentMd(workspaceId: string): Promise<void> {
  try {
    const existing = await db.file.findUnique({
      where: { workspaceId_path: { workspaceId, path: AGENT_MD_FILENAME } },
      select: { id: true },
    });
    if (existing) return;
    await db.file.create({
      data: {
        workspaceId,
        path: AGENT_MD_FILENAME,
        content: AGENT_MD_CONTENT,
        isBinary: false,
      },
    });
  } catch {}
}

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

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const ws = await db.workspace.findUnique({ where: { id } });
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    await ensureAgentMd(id);
    return NextResponse.json({ workspace: toWorkspaceDTO(ws) });
  } catch (e) {
    console.error('GET /api/workspaces/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
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
  } catch (e) {
    console.error('PATCH /api/workspaces/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await ensureDbInitialized();
    const { id } = await params;
    const ws = await db.workspace.findUnique({ where: { id } });
    if (!ws) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    await db.workspace.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/workspaces/[id] error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 });
  }
}
