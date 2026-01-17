import { getPlatform } from "@/host/platform";
import PlatformProvider from "@/host/platform-provider";
import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/scaffolds/workspace";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

type Params = { org: string; proj: string };

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org, proj } = await params;

  // in local dev, the vercel insights script is not loaded, will hit this route
  // also ignore standardized endpoints like "/.well-known/**"
  if (org.startsWith("_") || org.startsWith(".")) return notFound();

  const cookieStore = await cookies();
  const platform = await getPlatform(cookieStore);

  const client = await createClient();

  const { data: auth } = await client.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data: organization, error: err } = await client
    .from("organization")
    .select(
      `
      *,
      members:organization_member(*)
    `
    )
    .eq("name", org)
    .single();

  if (err) console.error("org err", err);
  if (!organization) {
    return notFound();
  }

  return (
    <PlatformProvider {...platform}>
      <Workspace organization={organization} project={proj}>
        {children}
      </Workspace>
    </PlatformProvider>
  );
}
