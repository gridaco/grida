"use client";

import React, { use } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  OpenInNewWindowIcon,
  PlusIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewDocumentButton } from "@/scaffolds/workspace/create-new-document-button";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/grida-forms-hosted/e/powered-by-brand-footer";
import { FolderPlus } from "lucide-react";
import { CreateNewProjectDialog } from "@/scaffolds/workspace/new-project-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/scaffolds/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentsGrid } from "./_components/documents-grid";

export default function OrganizationDashboardPage(props: {
  params: Promise<{
    org: string;
  }>;
  searchParams: Promise<{
    layout?: "grid" | "list";
  }>;
}) {
  const searchParams = use(props.searchParams);
  const layout = searchParams.layout ?? "list";

  const { loading, organization, projects, documents, refresh } =
    useWorkspace();

  return (
    <main className="w-full h-full overflow-y-scroll">
      <div className="container mx-auto">
        <header className="py-10">
          <div>
            <span className="text-2xl font-black">Home</span>
          </div>
        </header>
        {loading ? (
          <></>
        ) : (
          <>
            <section className="py-10">
              <ProjectStats project_ids={projects.map((p) => p.id)} />
            </section>
          </>
        )}
        <section className="w-full flex justify-end gap-2 mt-10">
          <Link href="?layout=grid" replace>
            <ViewGridIcon />
          </Link>
          <Link href="?layout=list" replace>
            <ViewHorizontalIcon />
          </Link>
        </section>
        <hr className="mb-10 mt-5" />
        {loading ? (
          <ProjectsLoading />
        ) : (
          <>
            {projects.length === 0 && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FolderPlus />
                  </EmptyMedia>
                  <EmptyTitle>No projects yet</EmptyTitle>
                  <EmptyDescription>
                    Create your first project to get started.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <CreateNewProjectDialog org={organization.name}>
                    <Button variant="outline">
                      <PlusIcon />
                      Create your first project
                    </Button>
                  </CreateNewProjectDialog>
                </EmptyContent>
              </Empty>
            )}
            {projects.map((p) => {
              const projectdocuments = documents.filter(
                (d) => d.project_id === p.id
              );

              return (
                <div key={p.id} className="mb-40">
                  <header className="sticky top-0 py-5 mb-10 flex justify-between items-center border-b bg-background z-10">
                    <Link href={`/${organization.name}/${p.name}`}>
                      <h2 className="text-2xl font-bold">
                        {p.name}
                        <OpenInNewWindowIcon className="inline align-middle ms-2 size-5" />
                      </h2>
                    </Link>
                    <CreateNewDocumentButton
                      project_name={p.name}
                      project_id={p.id}
                    >
                      <Button className="gap-1">
                        <PlusIcon />
                        Create
                        <ChevronDownIcon />
                      </Button>
                    </CreateNewDocumentButton>
                  </header>
                  <DocumentsGrid
                    organization_name={organization.name}
                    project_name={p.name}
                    documents={projectdocuments}
                    layout={layout}
                    onChange={refresh}
                  />
                </div>
              );
            })}
          </>
        )}
        <footer className="mt-10 mb-5">
          <PoweredByGridaFooter />
        </footer>
      </div>
    </main>
  );
}

function ProjectsLoading() {
  return (
    <div className="w-full grid gap-2">
      <Skeleton className="w-full h-10" />
      <Skeleton className="w-full h-10" />
      <Skeleton className="w-full h-10" />
      <Skeleton className="w-full h-10" />
    </div>
  );
}

function RenameDialog() {
  //
}
