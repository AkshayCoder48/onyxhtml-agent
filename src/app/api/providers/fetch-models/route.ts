import { NextRequest, NextResponse } from "next/server";
import { db, ensureDbInitialized } from "@/lib/db";
import { fetchProviderModels, isBuiltInProvider } from "@/lib/ai/provider";

export async function POST(req: NextRequest) {
  try {
    await ensureDbInitialized();
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON", models: [] }, { status: 400 });
    }

    const baseURL = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
    const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : null;

    if (!baseURL) {
      return NextResponse.json({ error: "baseURL is required", models: [] }, { status: 400 });
    }

    const tempProvider: any = {
      id: "temp",
      name: "temp",
      baseURL: baseURL.replace(/\/+$/, ""),
      apiKey,
      model: "temp",
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const models = await fetchProviderModels(tempProvider);
    return NextResponse.json({ models });
  } catch (e) {
    console.error('POST /api/providers/fetch-models error:', e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fetch models", models: [] });
  }
}
