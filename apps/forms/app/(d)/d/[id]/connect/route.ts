import { NextRequest, NextResponse } from "next/server";

export function GET(
  req: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  const id = context.params.id;
  const origin = req.nextUrl.origin;

  return NextResponse.redirect(origin + `/d/${id}/connect/customer`, {
    status: 301,
  });
}
