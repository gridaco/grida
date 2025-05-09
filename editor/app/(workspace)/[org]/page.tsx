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
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { BoxSelectIcon } from "lucide-react";
import { CreateNewProjectDialog } from "@/scaffolds/workspace/new-project-dialog";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
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
              <Card>
                <CardContent className="py-16">
                  <CardHeader />
                  <div className="flex flex-col items-center justify-center gap-8">
                    <div className="flex flex-col gap-2 items-center">
                      <BoxSelectIcon className="w-12 h-12 text-muted-foreground" />
                      <h2 className="text-lg text-muted-foreground">
                        No projects yet
                      </h2>
                    </div>
                    <CreateNewProjectDialog org={organization.name}>
                      <Button variant="outline">
                        <PlusIcon className="inline w-4 h-4 me-2" />
                        Create your first project
                      </Button>
                    </CreateNewProjectDialog>
                  </div>
                  <CardFooter />
                </CardContent>
              </Card>
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
                        <OpenInNewWindowIcon className="inline align-middle ms-2 w-5 h-5" />
                      </h2>
                    </Link>
                    <CreateNewDocumentButton
                      project_name={p.name}
                      project_id={p.id}
                    >
                      <Button className="gap-1">
                        <PlusIcon />
                        Create New
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
