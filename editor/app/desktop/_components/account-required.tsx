/**
 * GRIDA-SEC-005 — protected Desktop routes share the native three-state
 * account classification and never turn an upstream outage into sign-out.
 *
 * Defense-in-depth account gate for authenticated Desktop surfaces.
 *
 * Electron main owns entry orchestration. This server guard prevents a direct
 * or restored protected URL from rendering before the controller's admission
 * checks; it is not a second window-lifecycle authority.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { desktop_account_session } from "@/lib/desktop/account-session-state";

export async function DesktopAccountRequired({
  children,
}: {
  children: React.ReactNode;
}) {
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
  if (state === "signed-out") redirect("/desktop/auth/sign-in");
  return <>{children}</>;
}
