import { formlink } from "@/lib/forms/url";
import { NextRequest, NextResponse } from "next/server";

export function GET(
  req: NextRequest,
  context: {
    params: { id: string };
  }
) {
  const origin = req.nextUrl.origin;
  const id = context.params.id;
  return NextResponse.redirect(formlink(origin, id), {
    status: 301,
  });
}
