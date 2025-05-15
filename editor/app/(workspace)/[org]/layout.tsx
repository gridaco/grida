import { createClient } from "@/lib/supabase/server";
import { Workspace } from "@/scaffolds/workspace";
import { notFound, redirect } from "next/navigation";
import { EditorHelpFab } from "@/scaffolds/globals/editor-help-fab";
import WorkspaceSidebar from "@/scaffolds/workspace/sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import Header from "./header";

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

  return (
    <SidebarProvider>
      <Workspace organization={organization}>
        <EditorHelpFab />
        <WorkspaceSidebar />
        <div className="h-full flex flex-1 w-full">
          <div className="flex flex-col overflow-hidden w-full h-full">
            <Header />
            {children}
          </div>
        </div>
      </Workspace>
    </SidebarProvider>
  );
}
