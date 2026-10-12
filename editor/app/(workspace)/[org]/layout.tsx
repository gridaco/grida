import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/scaffolds/workspace";
import { notFound, redirect } from "next/navigation";

type Params = { org: string };

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<Params>;
}>) {
  const { org } = await params;
  const client = await createClient();

  const { data: auth } = await client.auth.getUser();

  if (!auth.user) {
    return redirect("/sign-in?next=/" + encodeURIComponent(org));
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

  if (err) console.error("[org] - possibly not found", err, "while", org);
  if (!organization) {
    return notFound();
  }

  // The workspace chrome (sidebar, header) is applied per page by
  // `WorkspaceShell`, so the home gate at `/<org>` can render without it.
  return <Workspace organization={organization}>{children}</Workspace>;
}
