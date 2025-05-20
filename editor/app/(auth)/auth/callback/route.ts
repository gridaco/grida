import { resolve_next } from "@/host/url";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next");
  const redirect_uri = requestUrl.searchParams.get("redirect_uri");

  if (code) {
    const client = await createClient();
    await client.auth.exchangeCodeForSession(code);
  }

  // return
  if (redirect_uri || next) {
    return NextResponse.redirect(
      resolve_next(requestUrl.origin, redirect_uri || next)
    );
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(requestUrl.origin);
}
