import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { AGENT_TEMPLATE_FILE, TEMPLATES, TemplateKey } from "@/lib/templates";
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

export async function GET() {
  try {
    await ensureDbInitialized();
    const rows = await db.workspace.findMany({
      orderBy: { updatedAt: "desc" },
    });
    const workspaces = rows.map(toWorkspaceDTO);
    return NextResponse.json({ workspaces });
  } catch (e) {
    console.error('GET /api/workspaces error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed', workspaces: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDbInitialized();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "Untitled";
    const templateKey: TemplateKey = (TEMPLATES as any)[body?.template as string]
      ? (body.template as TemplateKey)
      : "blank";
    const tpl = TEMPLATES[templateKey];

    const ws = await db.workspace.create({
      data: {
        name,
        template: templateKey,
        activeFile: tpl.files.some((f) => f.path === "index.html") ? "index.html" : (tpl.files[0]?.path ?? null),
        settings: stringifyJSON({}),
      },
    });

    const seedFiles = [AGENT_TEMPLATE_FILE, ...tpl.files.filter(
      (f) => f.path !== AGENT_TEMPLATE_FILE.path
    )];
    if (seedFiles.length > 0) {
      await db.file.createMany({
        data: seedFiles.map((f) => ({
          workspaceId: ws.id,
          path: f.path,
          content: f.content,
          isBinary: false,
        })),
      });
    }

    const fresh = await db.workspace.findUnique({ where: { id: ws.id } });
    return NextResponse.json({ workspace: toWorkspaceDTO(fresh!) });
  } catch (e) {
    console.error('POST /api/workspaces error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to create workspace' }, { status: 500 });
  }
}
