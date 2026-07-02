/**
 * GRIDA-SEC-005 — desktop sign-in launch page (the ceremony's web side).
 *
 * The `/sign-in` sibling for the desktop app: opened in the SYSTEM browser
 * by the app's single "Sign in with browser" button, carrying only the
 * public PKCE `code_challenge`. The sign-in method is chosen HERE — the
 * desktop never names a provider — and every method binds its GoTrue flow
 * to the forwarded challenge (`@/host/auth/desktop-auth-flow`), returning
 * through the same `grida://auth/callback` deep link. Adding or changing
 * methods is a web deploy; the desktop is untouched.
 *
 * Mirrors the web sign-in page's insiders routing exactly: when
 * `NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH` is on, redirect to the insiders
 * email+password page with the challenge forwarded — its sign-in route
 * completes the desktop mint (see the insiders sign-in route's desktop
 * branch).
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ContinueWithGoogleButton } from "@/host/auth/continue-with-google-button";
import {
  buildAuthorizeUrl,
  isValidChallenge,
} from "@/host/auth/desktop-auth-flow";
import { SignInShell } from "../_components/shell";

export const metadata: Metadata = {
  title: "Sign in to Grida Desktop",
  robots: { index: false, follow: false },
};

const USE_INSIDERS_AUTH =
  process.env.NEXT_PUBLIC_GRIDA_USE_INSIDERS_AUTH === "1";

export default async function DesktopSignInLaunchPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string }>;
}) {
  const { challenge } = await searchParams;
  const valid = typeof challenge === "string" && isValidChallenge(challenge);

  if (!valid) {
    return (
      <SignInShell
        title={
          <>
            Sign in to
            <br /> Grida Desktop
          </>
        }
        subtitle="This link is incomplete. Start sign-in from the Grida app."
      >
        {null}
      </SignInShell>
    );
  }

  if (USE_INSIDERS_AUTH) {
    return redirect(
      "/insiders/auth/basic?challenge=" + encodeURIComponent(challenge)
    );
  }

  return (
    <SignInShell
      title={
        <>
          Sign in to
          <br /> Grida Desktop
        </>
      }
      subtitle="Choose how to sign in. You'll be sent back to the app."
    >
      <ContinueWithGoogleButton
        authorize_url={buildAuthorizeUrl({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
          provider: "google",
          challenge,
        })}
      />
    </SignInShell>
  );
}
