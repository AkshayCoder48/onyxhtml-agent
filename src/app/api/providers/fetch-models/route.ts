import { NextRequest, NextResponse } from "next/server";
import { fetchProviderModels, isBuiltInProvider } from "@/lib/ai/provider";

// POST /api/providers/fetch-models
// Body: { baseURL: string, apiKey?: string }
// Fetches models from an OpenAI-compatible endpoint without needing a saved provider.
// Used for the "fetch models" flow before saving.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const baseURL = typeof body?.baseURL === "string" ? body.baseURL.trim() : "";
  const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : null;

  if (!baseURL) {
    return NextResponse.json({ error: "baseURL is required" }, { status: 400 });
  }

  // Construct a temporary provider object for the fetch helper
  const tempProvider: any = {
    id: "temp",
    name: "temp",
    baseURL,
    apiKey,
    model: "temp",
    isActive: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // If it's built-in, return static list
  if (isBuiltInProvider(tempProvider)) {
    const { fetchProviderModels: fetchFn } = await import("@/lib/ai/provider");
    const models = await fetchFn(tempProvider);
    return NextResponse.json({ models });
  }

  try {
    const { fetchProviderModels } = await import("@/lib/ai/provider");
    const models = await fetchProviderModels(tempProvider);
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch models", models: [] },
      { status: 200 }
    );
  }
}
