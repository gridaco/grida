import { createRouteHandlerClient } from "@/lib/supabase/server";
import assert from "assert";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  const { data, error } = await supabase
    .from("gist")
    .insert({
      data: {
        ["form.json"]: body.src,
      },
    })
    .select()
    .single();

  if (error) {
    console.error(error);
    return NextResponse.error();
  }
  return NextResponse.json(data);
}
