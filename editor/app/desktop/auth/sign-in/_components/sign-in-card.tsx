"use client";

/**
 * Desktop sign-in card. Small and native-feeling: window chrome + a centered
 * card with a single method-neutral button (the Figma/Linear "log in with
 * browser" pattern).
 *
 * The button asks `/desktop/auth/start` for the web launch-page URL (which
 * pins the PKCE verifier cookie into this window's cookie jar), then opens
 * it in the SYSTEM browser via the bridge — never in the webview. The
 * sign-in METHOD is chosen on the web launch page; whatever it is, success
 * returns through the `grida://auth/callback` deep link and the main
 * process navigates this window to `/desktop/auth/callback`, so on success
 * this page simply goes away. Until then we show a passive waiting state
 * with a retry.
 */
import { useState } from "react";
import { GridaLogo } from "@/components/grida-logo";
import { getDesktopBridge } from "@/lib/desktop/bridge";
import { Button } from "@app/ui/components/button";
import {
  DesktopPageContent,
  DesktopPageShell,
} from "@/scaffolds/desktop/chrome/page-shell";

type Phase = "idle" | "starting" | "waiting";

/**
 * One generic message for every `auth_error` code (missing_code, GoTrue
 * flow/verifier failures, provider denials) — the codes are diagnostic,
 * not user-actionable, and "try again" is the remedy for all of them.
 */
const SIGN_IN_FAILED_MESSAGE =
  "Sign-in could not be completed. Please try again.";

export function SignInCard({ authError }: { authError: string | null }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(
    authError ? SIGN_IN_FAILED_MESSAGE : null
  );

  const signInWithBrowser = async () => {
    setError(null);
    setPhase("starting");
    try {
      const res = await fetch("/desktop/auth/start", { method: "POST" });
      if (!res.ok) throw new Error("start_failed");
      const { url } = (await res.json()) as { url: string };
      const bridge = getDesktopBridge();
      if (!bridge) throw new Error("bridge_missing");
      await bridge.shell.open_external(url);
      setPhase("waiting");
    } catch {
      setError("Couldn't open the browser to sign in. Please try again.");
      setPhase("idle");
    }
  };

  return (
    <DesktopPageShell>
      <DesktopPageContent className="flex items-center justify-center">
        <div className="flex w-full max-w-xs flex-col items-center gap-6 px-6 py-12">
          <GridaLogo size={32} />
          <div className="text-center">
            <h1 className="text-lg font-semibold">Sign in to Grida</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account connects this app to Grida.
            </p>
          </div>

          {phase === "waiting" ? (
            <div className="flex w-full flex-col items-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">
                Finish signing in from your browser. This window will continue
                automatically.
              </p>
              <Button variant="ghost" size="sm" onClick={signInWithBrowser}>
                Try again
              </Button>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={signInWithBrowser}
              disabled={phase === "starting"}
            >
              Sign in with browser
            </Button>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </DesktopPageContent>
    </DesktopPageShell>
  );
}
