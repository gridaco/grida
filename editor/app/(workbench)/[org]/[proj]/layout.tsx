import { getPlatform } from "@/host/platform";
import PlatformProvider from "@/host/platform-provider";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
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
  if (org.startsWith("_")) return notFound();

  const cookieStore = await cookies();
  const platform = await getPlatform(cookieStore);

  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data: organization, error: err } = await wsclient
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
