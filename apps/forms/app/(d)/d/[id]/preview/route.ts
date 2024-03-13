import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: {
      id: string;
    };
  }
) {
  const id = context.params.id;
  const origin = req.nextUrl.origin;

  // TODO: fetch custom_preview_url_path and build the path

  return NextResponse.redirect(origin + `/d/e/${id}`, { status: 301 });
}
