import { NextRequest, NextResponse } from "next/server";

type Params = {
  organization_name: string;
};

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const origin = req.nextUrl.origin;
  const { organization_name: org } = await context.params;

  const dashboard = `/${org}`;
  return NextResponse.redirect(origin + dashboard, {
    status: 302,
  });
}
