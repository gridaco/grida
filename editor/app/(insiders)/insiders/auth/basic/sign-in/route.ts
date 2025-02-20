import type { Database } from "@/database.types";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, res: NextResponse) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient<Database>({
    cookies: () => cookieStore,
  });

  const data = await req.formData();
  const email = data.get("email") as string;
  const password = data.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error("[INSIDER] Sign in error", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log("[INSIDER] Sign in successful");

  return NextResponse.redirect("http://localhost:3000/insiders/welcome", {
    status: 302,
  });
}
