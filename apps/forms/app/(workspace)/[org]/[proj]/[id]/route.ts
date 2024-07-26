import { editorlink } from "@/lib/forms/url";
import { NextRequest, NextResponse } from "next/server";

export function GET(
  req: NextRequest,
  context: {
    params: {
      org: string;
      proj: string;
      id: string;
    };
  }
) {
  const origin = req.nextUrl.origin;
  const { id: form_id, org, proj } = context.params;

  return NextResponse.redirect(
    editorlink("data", {
      org,
      proj,
      origin,
      form_id,
    }),
    {
      status: 301,
    }
  );
}
