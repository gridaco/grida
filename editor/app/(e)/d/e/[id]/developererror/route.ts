import { formlink } from "@/lib/forms/url";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const origin = req.nextUrl.origin;
  const { id } = await context.params;

  // we don't have developer error page yet, just redirect to bad request
  return NextResponse.redirect(formlink(origin, id, "badrequest"), {
    status: 301,
  });
}
