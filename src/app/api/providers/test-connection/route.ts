import { NextRequest, NextResponse } from "next/server";
import { testProviderConnection, ZAI_BUILT_IN_BASEURL, ZAI_BUILT_IN_MODEL } from "@/lib/ai/provider";

// POST /api/providers/test-connection
// Body: { baseURL: string, apiKey?: string, model?: string }
// Tests a connection without needing a saved provider.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const baseURL = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : null;
  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined;

  if (!baseURL) {
    return NextResponse.json({ error: "baseURL is required" }, { status: 400 });
  }

  const tempProvider: any = {
    id: "temp",
    name: "temp",
    baseURL,
    apiKey,
    model: model ?? ZAI_BUILT_IN_MODEL,
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await testProviderConnection(tempProvider);
  return NextResponse.json(result);
}
