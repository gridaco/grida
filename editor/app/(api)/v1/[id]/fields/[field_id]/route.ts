import { NextRequest, NextResponse } from "next/server";

/**
 * returns a field data. useful when field data is changing rapidly
 */
export function GET(
  req: NextRequest,
  context: { params: { id: string; field_id: string } }
) {
  const { id, field_id } = context.params;

  return NextResponse.json({ message: "Service is running" });
}
