import { NextRequest, NextResponse } from "next/server";

/**
 * returns a field data. useful when field data is changing rapidly
 */
export function GET(req: NextRequest) {
  return NextResponse.json({ message: "Service is running" });
}
