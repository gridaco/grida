import { GridaLogo } from "@/components/grida-logo";
import { createServerComponentWorkspaceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const mock = {
  project_name: "Project Name",
};

type Params = {
  session: string;
};

export default async function CustomerPortalSession({
  params,
}: {
  params: Promise<Params>;
}) {
  const { session } = await params;
  const { project_name } = mock;
  const cookieStore = cookies();
  const authclient = createServerComponentWorkspaceClient(cookieStore);

  const { data } = await authclient.auth.getSession();
  // authclient.auth.getUserIdentities
  if (!data.session) {
    return redirect(`../login/${session}`);
  }

  return (
    <main className="flex min-h-screen">
      <aside className="flex flex-col p-10 bg-primary text-primary-foreground">
        <header>{project_name}</header>
        <div className="flex-1" />
        <div>
          <span className="text-xs">Powered by</span>
          <span className="ml-2">
            <GridaLogo size={15} className="fill-white" />
          </span>
        </div>
      </aside>
      <aside className="p-10 flex-1">
        <section>Responses</section>
        <section>In-Progress</section>
      </aside>
    </main>
  );
}
