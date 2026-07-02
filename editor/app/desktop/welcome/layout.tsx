/**
 * Forced sign-in gate for the desktop front door.
 *
 * The desktop requires a Grida account: the welcome surface (the default
 * window every launch lands on) redirects signed-out sessions to
 * `/desktop/auth/sign-in`. The gate lives on this segment's layout — NOT on
 * `app/desktop/layout.tsx`, which also wraps the sign-in page itself — and
 * `welcome/page.tsx` stays a client component untouched.
 *
 * Scope note: only the welcome entry is gated. Windows opened directly on
 * other `/desktop/*` surfaces (file associations, settings) are a separate
 * product decision.
 */
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DesktopWelcomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/desktop/auth/sign-in");
  return <>{children}</>;
}
