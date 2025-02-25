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
  const { id, org, proj } = context.params;

  return NextResponse.redirect(
    editorlink("data", {
      org,
      proj,
      origin,
      document_id: id,
    }),
    {
      status: 301,
    }
  );
}
