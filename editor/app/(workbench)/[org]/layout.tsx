import { getPlatform } from "@/host/platform";
import PlatformProvider from "@/host/platform-provider";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import { Workspace } from "@/scaffolds/workspace";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { org: string };
}>) {
  const org = params.org;

  // in local dev, the vercel insights script is not loaded, will hit this route
  if (org === "_vercel") return notFound();

  const cookieStore = cookies();
  const platform = await getPlatform(cookieStore);

  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data: organization, error: err } = await wsclient
    .from("organization")
    .select(`*`)
    .eq("name", org)
    .single();

  if (err) console.error("org err", err);
  if (!organization) {
    return notFound();
  }

  return (
    <PlatformProvider {...platform}>
      <Workspace organization={organization}>{children}</Workspace>
    </PlatformProvider>
  );
}
