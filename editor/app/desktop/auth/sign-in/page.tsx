/**
 * Desktop sign-in page — the forced front door of the desktop app.
 *
 * Server component: reads the session (already signed in → straight to the
 * welcome surface) and threads the `auth_error` code from a failed PKCE
 * exchange (`../callback/route.ts`) into the card. The ceremony itself runs
 * in the SYSTEM browser on the `/desktop-auth` launch page — this page
 * only starts the flow and waits; it never names a sign-in method.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  } = await client.auth.getUser();
  if (user) redirect("/desktop/welcome");

  return <SignInCard authError={auth_error ?? null} />;
}
