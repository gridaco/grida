import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const client = await createClient();

  await client.auth.signOut();

  const origin = req.nextUrl.origin;

  return NextResponse.redirect(origin + "/");
}
