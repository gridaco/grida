"use client";

import { Env } from "@/env";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { useSearchParams } from "next/navigation";

export function ContinueWithGoogleButton() {
  const supabase = createClientComponentClient();
  const search = useSearchParams();
  const next = search.get("next");

  const url = new URL(`${Env.client.HOST}/auth/callback`);

  if (next) {
    url.searchParams.set("next", next);
  }

  return (
    <button
      className="flex px-4 py-2 rounded items-center justify-center gap-4 border shadow-sm hover:shadow-md transition-shadow"
      onClick={() => {
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: url.toString(),
          },
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
      className="w-5 h-5 fill-black dark:fill-white"
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
