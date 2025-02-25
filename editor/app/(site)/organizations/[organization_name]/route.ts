import { NextRequest, NextResponse } from "next/server";

export function GET(
  req: NextRequest,
  context: {
    params: {
      organization_name: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  const org = context.params.organization_name;

  const dashboard = `/${org}`;
  return NextResponse.redirect(origin + dashboard, {
    status: 302,
  });
}
