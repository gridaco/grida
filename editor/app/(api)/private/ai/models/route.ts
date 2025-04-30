import { NextResponse } from "next/server";
import ai from "@/lib/ai";

export async function GET() {
  return NextResponse.json({ data: ai.image.models });
}
