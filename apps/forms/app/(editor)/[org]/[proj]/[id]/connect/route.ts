import { editorlink } from "@/lib/forms/url";
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
  const form_id = context.params.id;

  return NextResponse.redirect(
    editorlink("connect/share", { origin, form_id }),
    {
      status: 301,
    }
  );
}
