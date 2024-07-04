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

  // we don't have developer error page yet, just redirect to bad request
  return NextResponse.redirect(formlink(origin, id, "badrequest"), {
    status: 301,
  });
}
