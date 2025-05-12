"use client";

import { Env } from "@/env";
import { createBrowserClient } from "@/lib/supabase/client";

type ContinueWithGoogleButtonProps = {
  skipBrowserRedirect?: boolean;
  next?: string;
  redirect_uri?: string;
  onSuccess?: () => void;
};

export function ContinueWithGoogleButton({
  skipBrowserRedirect,
  next,
  redirect_uri,
  onSuccess,
}: ContinueWithGoogleButtonProps) {
  const client = createBrowserClient();

  const url = new URL(`${Env.web.HOST}/auth/callback`);

  if (next) {
    url.searchParams.set("next", next);
  }

  if (redirect_uri) {
    url.searchParams.set("redirect_uri", redirect_uri);
  }

  return (
    <button
      className="flex px-4 py-2 rounded-sm items-center justify-center gap-4 border shadow-sm hover:shadow-md transition-shadow"
      onClick={() => {
        client.auth
          .signInWithOAuth({
            provider: "google",
            options: {
              redirectTo: url.toString(),
              skipBrowserRedirect: skipBrowserRedirect,
            },
          })
          .then(({ data, error }) => {
            if (!error) {
              if (skipBrowserRedirect) {
                // Open popup
                const popup = window.open(
                  data.url,
                  "Sign in with Google",
                  "width=600,height=600"
                );

                // Listen for auth state changes
                const {
                  data: { subscription },
                } = client.auth.onAuthStateChange((event, session) => {
                  if (event === "SIGNED_IN" && session) {
                    popup?.close();
                    onSuccess?.();
                  }
                });

                // Cleanup subscription when popup is closed
                const checkPopup = setInterval(() => {
                  if (popup?.closed) {
                    clearInterval(checkPopup);
                    subscription.unsubscribe();
                  }
                }, 1000);
              } else {
                onSuccess?.();
              }
            }
          });
      }}
    >
      <GoogleLogo />
      Continue with Google
    </button>
  );
}

function GoogleLogo() {
  return (
    <svg
      className="size-5 fill-black dark:fill-white"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 210 210"
    >
      <path
        d="M0,105C0,47.103,47.103,0,105,0c23.383,0,45.515,7.523,64.004,21.756l-24.4,31.696C133.172,44.652,119.477,40,105,40
	c-35.841,0-65,29.159-65,65s29.159,65,65,65c28.867,0,53.398-18.913,61.852-45H105V85h105v20c0,57.897-47.103,105-105,105
	S0,162.897,0,105z"
      />
    </svg>
  );
}
