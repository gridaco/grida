import { resolve_next } from "@/lib/forms/url";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

export async function POST(req: NextRequest, res: NextResponse) {
  const requestUrl = new URL(req.url);

  const client = await createClient();

  const data = await req.formData();
  const email = data.get("email") as string;
  const password = data.get("password") as string;
  const redirect_uri = data.get("redirect_uri") as string | null;
  const next = data.get("next") as string | null;

  const { error } = await client.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error("[INSIDER] Sign in error", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log("[INSIDER] Sign in successful");

  if (redirect_uri) {
    return NextResponse.redirect(redirect_uri, {
      status: 302,
    });
  }

  if (next) {
    return NextResponse.redirect(resolve_next(requestUrl.origin, next), {
      status: 302,
    });
  }

  return NextResponse.redirect(requestUrl.origin + "/insiders/welcome", {
    status: 302,
  });
}
