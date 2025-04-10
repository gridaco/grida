"use client";

import React from "react";
import Link from "next/link";
import {
  AvatarIcon,
  ChevronDownIcon,
  DotsHorizontalIcon,
  FileIcon,
  ImageIcon,
  PlusIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewDocumentButton } from "@/scaffolds/workspace/create-new-document-button";
import { GDocument } from "@/types";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { GridCard, RowCard } from "@/components/site/form-card";
import { useWorkspace } from "@/scaffolds/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import Head from "next/head";
import { editorlink } from "@/lib/forms/url";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResourceTypeIcon } from "@/components/resource-type-icon";

export default function ProjectDashboardPage({
  params,
  searchParams,
}: {
  // TODO: [next15](https://nextjs.org/docs/app/building-your-application/upgrading/version-15#asynchronous-page)
  params: {
    org: string;
    proj: string;
  };
  // TODO: [next15](https://nextjs.org/docs/app/building-your-application/upgrading/version-15#asynchronous-page)
  searchParams: {
    layout?: "grid" | "list";
  };
}) {
  const { loading, projects, documents } = useWorkspace();
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost">
                    <DotsHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" side="bottom">
                  <Link
                    href={`/${organization_name}/${project_name}/customers`}
                  >
                    <DropdownMenuItem>
                      <ResourceTypeIcon
                        type="customer"
                        className="size-4 me-2"
                      />
                      Customers
                    </DropdownMenuItem>
                  </Link>
                  <Link
                    href={`/${organization_name}/${project_name}/campaigns`}
                  >
                    <DropdownMenuItem>
                      <ResourceTypeIcon
                        type="campaign"
                        className="size-4 me-2"
                      />
                      Campaigns
                    </DropdownMenuItem>
                  </Link>
                  <Link href={`/${organization_name}/${project_name}/www`}>
                    <DropdownMenuItem>
                      <ResourceTypeIcon
                        type="v0_site"
                        className="size-4 me-2"
                      />
                      Site
                    </DropdownMenuItem>
                  </Link>
                </DropdownMenuContent>
              </DropdownMenu>
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
                  Create New
                  <ChevronDownIcon />
                </Button>
              </CreateNewDocumentButton>
            </div>
          )}
        </header>

        {loading ? (
          <>
            <div>
              <Skeleton className="w-full h-32 rounded" />
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

function DocumentsGrid({
  organization_name,
  project_name,
  documents,
  layout,
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
          Documents
          <span className="ml-2 text-xs opacity-50">{documents.length}</span>
        </span>
        <span className="w-32">Entries</span>
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
