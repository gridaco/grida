"use client";

import React from "react";
import Link from "next/link";
import {
  PlusIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewDocumentButton } from "@/components/create-new-document-button";
import { GDocument, ConnectionSupabaseJoint, Form } from "@/types";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { GridCard, RowCard } from "@/components/site/form-card";
import { BoxSelectIcon } from "lucide-react";
import { CreateNewProjectDialog } from "@/scaffolds/workspace/new-project-dialog";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WorkspaceSidebar } from "@/scaffolds/workspace/sidebar";
import { useWorkspace } from "@/scaffolds/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { editorlink } from "@/lib/forms/url";

export default function DashboardProjectsPage({
  params,
  searchParams,
}: {
  params: {
    org: string;
  };
  searchParams: {
    layout?: "grid" | "list";
  };
}) {
  const layout = searchParams.layout ?? "list";

  const { state } = useWorkspace();
  const { loading, organization, projects, documents } = state;

  return (
    <div className="h-full flex flex-1 w-full">
      <WorkspaceSidebar />
      <main className="w-full h-full overflow-y-scroll">
        <div className="container mx-auto">
          <header className="py-10">
            <div>
              <span className="text-2xl font-black">Forms</span>
            </div>
          </header>
          <section className="w-full flex justify-end gap-2 mt-10">
            <Link href="?layout=grid" replace>
              <ViewGridIcon />
            </Link>
            <Link href="?layout=list" replace>
              <ViewHorizontalIcon />
            </Link>
          </section>
          <hr className="mb-10 mt-5 dark:border-neutral-700" />
          {loading ? (
            <ProjectsLoading />
          ) : (
            <>
              {projects.length === 0 && (
                <Card>
                  <CardContent>
                    <CardHeader />
                    <div className="flex flex-col items-center justify-center gap-4">
                      <BoxSelectIcon className="w-12 h-12 text-muted-foreground" />
                      <h2 className="text-lg font-bold mt-4">No project yet</h2>
                      <CreateNewProjectDialog org={organization.name}>
                        <Button variant="secondary">
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
                    <header className="py-4 mb-2 flex justify-between items-center">
                      <div>
                        <h2 className="text-2xl font-bold">{p.name}</h2>
                      </div>
                      <CreateNewDocumentButton
                        project_name={p.name}
                        project_id={p.id}
                      />
                    </header>
                    <section className="py-10">
                      <ProjectStats project_id={p.id} />
                    </section>
                    <DocumentsGrid
                      organization_name={organization.name}
                      project_name={p.name}
                      documents={projectdocuments}
                      layout={layout}
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
    </div>
  );
}

function DocumentsGrid({
  documents,
  layout,
  organization_name,
  project_name,
}: {
  organization_name: string;
  project_name: string;
  documents: GDocument[];
  layout: "grid" | "list";
}) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {documents?.map((doc, i) => (
          <Link
            key={i}
            href={editorlink(".", {
              org: organization_name,
              proj: project_name,
              document_id: doc.id,
            })}
            prefetch={false}
          >
            <GridCard {...doc} />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-4">
      <header className="flex text-sm opacity-80">
        <span className="flex-1">
          Form
          <span className="ml-2 text-xs opacity-50">{documents.length}</span>
        </span>
        <span className="w-32">Responses</span>
        <span className="w-44">Updated At</span>
      </header>
      {documents?.map((doc, i) => (
        <Link
          key={i}
          href={editorlink(".", {
            org: organization_name,
            proj: project_name,
            document_id: doc.id,
          })}
          prefetch={false}
        >
          <RowCard {...doc} />
        </Link>
      ))}
    </div>
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
