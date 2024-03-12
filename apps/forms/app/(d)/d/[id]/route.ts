import { NextRequest, NextResponse } from "next/server";

export function GET(
  req: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  return NextResponse.redirect(origin + "/d/" + context.params.id + "/design", {
    status: 301,
  });
}
