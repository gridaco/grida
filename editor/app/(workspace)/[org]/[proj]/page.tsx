"use client";

import React, { use } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  PlusIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewDocumentButton } from "@/scaffolds/workspace/create-new-document-button";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { useWorkspace } from "@/scaffolds/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DocumentsGrid } from "@/app/(workspace)/[org]/_components/documents-grid";
import { SettingsIcon } from "lucide-react";
import Head from "next/head";

export default function ProjectDashboardPage(props: {
  params: Promise<{
    org: string;
    proj: string;
  }>;
  searchParams: Promise<{
    layout?: "grid" | "list";
  }>;
}) {
  const searchParams = use(props.searchParams);
  const params = use(props.params);
  const { loading, projects, documents, refresh } = useWorkspace();
  const { org: organization_name, proj: project_name } = params;

  const layout = searchParams.layout ?? "list";

  const project = projects.find((p) => p.name === project_name);

  if (!project && !loading) {
    return notFound();
  }

  return (
    <main className="w-full h-full overflow-y-scroll">
      <Head>
        <title>
          {organization_name}/{project_name} | Grida
        </title>
      </Head>
      <div className="container mx-auto">
        <header className="py-10 flex justify-between">
          <div>
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              {project_name}
              <Link href={`/${organization_name}/${project_name}/dash`}>
                <Button size="icon" variant="ghost">
                  <SettingsIcon className="size-4" />
                </Button>
              </Link>
            </span>
          </div>
          {project && (
            <div>
              <CreateNewDocumentButton
                project_name={project_name}
                project_id={project.id}
              >
                <Button className="gap-1">
                  <PlusIcon />
                  Create
                  <ChevronDownIcon />
                </Button>
              </CreateNewDocumentButton>
            </div>
          )}
        </header>

        {loading ? (
          <>
            <div>
              <Skeleton className="w-full h-32 rounded-sm" />
            </div>
          </>
        ) : (
          <div>
            <section>
              <ProjectStats project_ids={[project!.id]} />
            </section>
            <section className="w-full flex justify-end gap-2 mt-10">
              <Link href="?layout=grid" replace>
                <ViewGridIcon />
              </Link>
              <Link href="?layout=list" replace>
                <ViewHorizontalIcon />
              </Link>
            </section>
            <hr className="mb-10 mt-5 dark:border-neutral-700" />
            <DocumentsGrid
              organization_name={organization_name}
              project_name={project_name}
              documents={documents.filter(
                (doc) => doc.project_id === project!.id
              )}
              layout={layout}
              onChange={refresh}
            />
            <footer className="mt-10 mb-5">
              <PoweredByGridaFooter />
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}
