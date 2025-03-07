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
  return NextResponse.redirect(
    origin + `/organizations/${org}/settings/profile`,
    {
      status: 307,
    }
  );
}
