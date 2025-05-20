import { formlink } from "@/host/url";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  const origin = req.nextUrl.origin;
  const { id: form_id } = await context.params;
  return NextResponse.redirect(formlink(origin, form_id), {
    status: 301,
  });
}
