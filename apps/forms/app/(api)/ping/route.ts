import { NextRequest, NextResponse } from "next/server";

export function GET(req: NextRequest) {
  const geo = req.geo;
  const xforwardedfor = req.headers.get("x-forwarded-for");
  return NextResponse.json({
    geo,
    "x-forwarded-for": xforwardedfor,
  });
}
