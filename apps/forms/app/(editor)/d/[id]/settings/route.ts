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
  const form_id = context.params.id;
  const origin = req.nextUrl.origin;

  return NextResponse.redirect(
    editorlink("settings/general", { origin, form_id }),
    {
      status: 301,
    }
  );
}
