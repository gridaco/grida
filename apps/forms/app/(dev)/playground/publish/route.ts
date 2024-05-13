import { createRouteHandlerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient(cookieStore);

  // check if user is logged in
  const { data: _user } = await supabase.auth.getUser();
  if (!_user?.user) {
    return NextResponse.redirect("/sign-in?next=/playground/publish");
  }

  const { data } = await supabase
    .from("form")
    .insert({
      title: "",
      project_id: 0,
    })
    .select()
    .single();
  //
  // publish
}
