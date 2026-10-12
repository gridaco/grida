import { cookies } from "next/headers";
import { WorkHome } from "./_components/work-home";
import { HomeGate } from "./_components/home-gate";
import { OrgHome } from "./_components/org-home";
import { ConsoleLinks } from "@/lib/platform/console-links";
import { WorkspaceShell } from "./_components/workspace-shell";

export default async function OrganizationHomePage(props: {
  params: Promise<{
    org: string;
  }>;
  searchParams: Promise<{
    layout?: "grid" | "list";
  }>;
}) {
  const [{ org }, searchParams, cookieStore] = await Promise.all([
    props.params,
    props.searchParams,
    cookies(),
  ]);

  // TODO(org-home-gate): temporary gate — see `_components/home-gate.tsx`.
  // The cookie is scoped to `Path=/<org>`, so it is only present for this org.
  if (OrgHome.isWork(cookieStore.get(OrgHome.COOKIE)?.value)) {
    return (
      <WorkspaceShell org={org}>
        <WorkHome layout={searchParams.layout ?? "list"} />
      </WorkspaceShell>
    );
  }

  return <HomeGate consoleHref={ConsoleLinks.aiGateway(org)} />;
}
