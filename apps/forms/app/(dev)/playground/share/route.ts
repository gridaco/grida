import { createRouteHandlerClient } from "@/lib/supabase/server";
import assert from "assert";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data } = await supabase
    .from("gist")
    .insert({
      data: body,
    })
    .select()
    .single();

  assert(data, "Failed to create a new playground gist");

  return NextResponse.json(data);
}
