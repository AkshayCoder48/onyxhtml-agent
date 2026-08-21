import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/db";

export async function GET() {
  try {
    await ensureDbInitialized();
    return NextResponse.json({ message: "Hello, world!", status: "ok" });
  } catch (e) {
    return NextResponse.json({ message: "Hello, world!", warning: e instanceof Error ? e.message : String(e) });
  }
}
