import { NextRequest, NextResponse } from "next/server";

export function GET(
  request: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  const form_id = context.params.id;
  const origin = request.nextUrl.origin;

  return NextResponse.redirect(
    origin + `/d/${form_id}/connect/store/get-started`,
    {
      status: 301,
    }
  );
}
