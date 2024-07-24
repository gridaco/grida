import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(origin);
}
