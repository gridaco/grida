import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildUniversalDestination,
  matchUniversalRoute,
  normalizeUniversalPath,
} from "@/host/url";

type Params = {
  path?: string[];
};

type ProjectInfo = {
  organizationName: string;
  projectName: string;
};

type DocumentInfo = ProjectInfo & {
  id: string;
  title: string;
  doctype: string;
};

export default async function UniversalRoutePicker({
  params,
}: {
  params: Promise<Params>;
}) {
  const { path } = await params;
  const pathString = Array.isArray(path) ? path.join("/") : "";
  const universalPath = normalizeUniversalPath(pathString);

  const matches = matchUniversalRoute(universalPath);
  if (matches.length !== 1) {
    return notFound();
  }

  const route = matches[0]!;
  const client = await createClient();
  const { data: auth } = await client.auth.getUser();

  if (!auth.user) {
    const nextPath = universalPath ? `/_/${universalPath}` : "/_/";
    return redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }

  if (route.scope === "project") {
    const { data: memberships } = await client
      .from("organization_member")
      .select(
        `
        organization:organization(
          name,
          projects:project(name)
        )
      `
      )
      .eq("user_id", auth.user.id);

    const projects: ProjectInfo[] = [];
    for (const membership of memberships ?? []) {
      const organization = membership.organization as
        | { name: string; projects: { name: string }[] }
        | null;
      if (!organization?.name) continue;
      for (const project of organization.projects ?? []) {
        if (!project?.name) continue;
        projects.push({
          organizationName: organization.name,
          projectName: project.name,
        });
      }
    }

    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold">Select a project</h1>
          <p className="text-sm text-muted-foreground">
            Choose the org/project context for{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              {formatUniversalPath(route.path)}
            </code>
            .
          </p>
        </header>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No projects available.
          </p>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => {
              const destination = buildUniversalDestination(route.id, {
                org: project.organizationName,
                proj: project.projectName,
              });
              return (
                <li key={`${project.organizationName}/${project.projectName}`}>
                  <Link
                    href={destination}
                    className="flex items-center justify-between rounded border px-4 py-3 hover:bg-muted"
                  >
                    <div>
                      <div className="text-sm text-muted-foreground">
                        {project.organizationName}
                      </div>
                      <div className="font-medium">{project.projectName}</div>
                    </div>
                    <span className="text-sm text-muted-foreground">Open →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    );
  }

  const docQuery = client
    .from("document")
    .select(
      `
      id,
      title,
      doctype,
      updated_at,
      project:project(
        name,
        organization:organization(name)
      )
    `
    )
    .order("updated_at", { ascending: false });

  if (route.requiredDoctypes?.length) {
    docQuery.in("doctype", route.requiredDoctypes);
  }

  const { data: documents } = await docQuery;

  const docs: DocumentInfo[] = [];
  for (const doc of documents ?? []) {
    const project = doc.project as
      | { name: string; organization: { name: string } }
      | null;
    if (!project?.name || !project.organization?.name) continue;
    docs.push({
      id: doc.id as string,
      title: (doc.title as string) || "Untitled",
      doctype: doc.doctype as string,
      organizationName: project.organization.name,
      projectName: project.name,
    });
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Select a document</h1>
        <p className="text-sm text-muted-foreground">
          Choose the org/project/doc context for{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {formatUniversalPath(route.path)}
          </code>
          .
        </p>
      </header>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No matching documents available.
        </p>
      ) : (
        <ul className="space-y-3">
          {docs.map((doc) => {
            const destination = buildUniversalDestination(route.id, {
              org: doc.organizationName,
              proj: doc.projectName,
              docId: doc.id,
            });
            return (
              <li key={doc.id}>
                <Link
                  href={destination}
                  className="flex items-center justify-between rounded border px-4 py-3 hover:bg-muted"
                >
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {doc.organizationName} / {doc.projectName}
                    </div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {doc.doctype}
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">Open →</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function formatUniversalPath(path: string) {
  const normalized = normalizeUniversalPath(path);
  return normalized ? `/_/${normalized}` : "/_/";
}
