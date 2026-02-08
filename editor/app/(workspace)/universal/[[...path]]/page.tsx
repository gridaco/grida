import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  buildUniversalDestination,
  matchUniversalRoute,
  normalizeUniversalPath,
} from "@/host/url";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { ArrowRight, Folder, FileText } from "lucide-react";

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
          <Item variant="muted" size="sm" className="border">
            <ItemMedia variant="icon">
              <Folder className="size-4" />
            </ItemMedia>
            <ItemContent>
              <ItemTitle>No projects available</ItemTitle>
              <ItemDescription>
                You don’t have access to any projects in this account.
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : (
          <ItemGroup className="gap-2">
            {projects.map((project) => {
              const destination = buildUniversalDestination(route.id, {
                org: project.organizationName,
                proj: project.projectName,
              });
              return (
                <Item
                  key={`${project.organizationName}/${project.projectName}`}
                  asChild
                  variant="outline"
                  size="sm"
                  className="hover:bg-accent/50"
                >
                  <Link href={destination} prefetch={false}>
                    <ItemMedia variant="icon">
                      <Folder className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>{project.projectName}</ItemTitle>
                      <ItemDescription>{project.organizationName}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-muted-foreground">
                      <span className="text-sm">Open</span>
                      <ArrowRight className="size-4" />
                    </ItemActions>
                  </Link>
                </Item>
              );
            })}
          </ItemGroup>
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
        <Item variant="muted" size="sm" className="border">
          <ItemMedia variant="icon">
            <FileText className="size-4" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>No matching documents</ItemTitle>
            <ItemDescription>
              You don’t have any documents that can open{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {formatUniversalPath(route.path)}
              </code>
              .
            </ItemDescription>
          </ItemContent>
        </Item>
      ) : (
        <ItemGroup className="gap-2">
          {docs.map((doc) => {
            const destination = buildUniversalDestination(route.id, {
              org: doc.organizationName,
              proj: doc.projectName,
              docId: doc.id,
            });
            return (
              <Item
                key={doc.id}
                asChild
                variant="outline"
                size="sm"
                className="hover:bg-accent/50"
              >
                <Link href={destination} prefetch={false}>
                  <ItemMedia variant="icon">
                    <FileText className="size-4" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{doc.title}</ItemTitle>
                    <ItemDescription>
                      {doc.organizationName} / {doc.projectName} · {doc.doctype}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions className="text-muted-foreground">
                    <span className="text-sm">Open</span>
                    <ArrowRight className="size-4" />
                  </ItemActions>
                </Link>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </main>
  );
}

function formatUniversalPath(path: string) {
  const normalized = normalizeUniversalPath(path);
  return normalized ? `/_/${normalized}` : "/_/";
}
