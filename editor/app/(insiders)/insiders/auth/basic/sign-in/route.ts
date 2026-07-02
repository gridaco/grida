import { resolve_next } from "@/host/url";
import {
  buildOtpRequest,
  extractVerifyUrl,
  isValidChallenge,
} from "@/host/auth/desktop-auth-flow";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

/**
 * GRIDA-SEC-005 — desktop branch of the insiders sign-in (see below).
 * Local-only by GRIDA-SEC-002 (the proxy 404s `/insiders/*` outside
 * development), so coupling to the local Supabase Mailpit capture is fine.
 */
const MAILPIT_URL = "http://127.0.0.1:54324";

/**
 * Completes the desktop sign-in mint for an ALREADY password-verified
 * insider: fires the GoTrue email OTP bound to the desktop's PKCE
 * challenge, then consumes the emailed verify link straight from Mailpit —
 * the developer keeps the email+password flow and never opens an inbox.
 * Following the returned verify URL makes GoTrue 302 to
 * `grida://auth/callback?code=…`, i.e. the exact production callback path.
 * A password grant alone can never produce that challenge-bound code
 * (GoTrue returns sessions directly for passwords), which is why the mint
 * rides the OTP-link machinery.
 */
async function mintDesktopVerifyUrl(
  email: string,
  challenge: string
): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const since = Date.now();

  const otp = buildOtpRequest({
    supabaseUrl,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    email,
    challenge,
  });
  const sent = await fetch(otp.url, {
    ...otp.init,
    signal: AbortSignal.timeout(2000),
  });
  if (!sent.ok) {
    console.error("[INSIDER] desktop OTP send failed:", sent.status);
    return null;
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    // GoTrue sends synchronously, so the mail is usually already captured —
    // check immediately and only sleep between retries.
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    try {
      // Timeouts so a hung Mailpit fails fast into the retry loop instead of
      // blocking the request handler indefinitely.
      const list = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=10`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!list.ok) continue;
      const { messages } = (await list.json()) as {
        messages?: Array<{
          ID: string;
          Created: string;
          To?: Array<{ Address?: string }>;
        }>;
      };
      const message = (messages ?? []).find(
        (m) =>
          (m.To ?? []).some(
            (t) => t.Address?.toLowerCase() === email.toLowerCase()
          ) && new Date(m.Created).getTime() >= since - 2000
      );
      if (!message) continue;
      const full = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!full.ok) continue;
      const body = (await full.json()) as { Text?: string; HTML?: string };
      const verify = extractVerifyUrl(
        `${body.Text ?? ""}\n${body.HTML ?? ""}`,
        supabaseUrl
      );
      if (verify) return verify;
    } catch {
      // Mailpit transiently unavailable — keep polling.
    }
  }
  console.error("[INSIDER] desktop OTP mail did not arrive in Mailpit");
  return null;
}

export async function POST(req: NextRequest) {
  const requestUrl = new URL(req.url);

  const client = await createClient();

  const data = await req.formData();
  const email = data.get("email") as string;
  const password = data.get("password") as string;
  const redirect_uri = data.get("redirect_uri") as string | null;
  const next = data.get("next") as string | null;
  const challenge = data.get("challenge") as string | null;

  const { error } = await client.auth.signInWithPassword({
    email: email,
    password: password,
  });

  if (error) {
    console.error("[INSIDER] Sign in error", error);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.log("[INSIDER] Sign in successful");

  // GRIDA-SEC-005 — desktop sign-in: the SAME email+password verification
  // as the web flow above (a browser session is set as a side effect,
  // exactly like signing into the web), then the challenge-bound
  // deep-link mint.
  if (challenge && isValidChallenge(challenge)) {
    const verify = await mintDesktopVerifyUrl(email, challenge);
    if (!verify) {
      return NextResponse.redirect(
        new URL(
          `/insiders/auth/basic?challenge=${encodeURIComponent(challenge)}&error=desktop_link_failed`,
          requestUrl.origin
        ),
        { status: 302 }
      );
    }
    // The browser follows this to GoTrue, which 302s to
    // grida://auth/callback?code=… — handing off to the desktop app.
    return NextResponse.redirect(verify, { status: 302 });
  }

  if (redirect_uri) {
    return NextResponse.redirect(new URL(redirect_uri, requestUrl.origin), {
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
