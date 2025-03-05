import { formlink } from "@/lib/forms/url";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id: form_id } = await context.params;
  const origin = req.nextUrl.origin;

  return NextResponse.redirect(formlink(origin, form_id), { status: 301 });
}
