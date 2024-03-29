import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;

export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;

  return NextResponse.redirect(origin + "/forms-playground", {
    status: 301,
  });
}
