import { editorlink } from "@/lib/forms/url";
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
    editorlink("data/responses", { origin, form_id }),
    {
      status: 301,
    }
  );
}
