/**
 * Desktop sign-in page — the forced front door of the desktop app.
 *
 * Server component: reads the session (already signed in → straight to the
 * fixed completion surface) and threads the `auth_error` code from a failed
 * PKCE exchange (`../callback/route.ts`) into the card. The ceremony itself
 * runs in the SYSTEM browser on the `/desktop-auth` launch page — this page
 * only starts the flow and waits; it never names a sign-in method.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { desktop_account_session } from "@/lib/desktop/account-session-state";
import { SignInCard } from "./_components/sign-in-card";

export default async function DesktopSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  const { auth_error } = await searchParams;

  const client = await createClient();
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  const state = desktop_account_session.classify({
    has_user: user !== null,
    error,
  });
  if (state === "unavailable") {
    throw new Error("Grida account session is temporarily unavailable");
  }
  if (state === "signed-in") {
    redirect("/desktop/auth/complete");
  }

  return <SignInCard authError={auth_error ?? null} />;
}
