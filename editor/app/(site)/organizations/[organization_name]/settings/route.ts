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
  const organization_name = context.params.organization_name;
  return NextResponse.redirect(
    origin + `/organizations/${organization_name}/settings/profile`,
    {
      status: 307,
    }
  );
}
