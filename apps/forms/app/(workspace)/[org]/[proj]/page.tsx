"use client";

import React from "react";
import Link from "next/link";
import { ViewGridIcon, ViewHorizontalIcon } from "@radix-ui/react-icons";
import { CreateNewDocumentButton } from "@/components/create-new-document-button";
import { Form, GDocument } from "@/types";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { GridCard, RowCard } from "@/components/site/form-card";
import { WorkspaceSidebar } from "@/scaffolds/workspace/sidebar";
import { useWorkspace } from "@/scaffolds/workspace";
import { Skeleton } from "@/components/ui/skeleton";
import Head from "next/head";
import { editorlink } from "@/lib/forms/url";

export default function FormsDashboardPage({
  params,
  searchParams,
}: {
  params: {
    org: string;
    proj: string;
  };
  searchParams: {
    layout?: "grid" | "list";
  };
}) {
  const { state } = useWorkspace();

  const { loading, organization, projects, documents } = state;
  const { org: organization_name, proj: project_name } = params;

  const layout = searchParams.layout ?? "list";

  const project = projects.find((p) => p.name === project_name);

  return (
    <div className="h-full flex flex-1 w-full">
      <Head>
        <title>
          {organization_name}/{project_name} | Grida Forms
        </title>
      </Head>
      <WorkspaceSidebar />
      <main className="w-full h-full overflow-y-scroll">
        <div className="container mx-auto">
          <header className="py-10 flex justify-between">
            <div>
              <span className="flex items-center gap-2 text-2xl font-black select-none">
                {project_name}
              </span>
              <span className="font-mono opacity-50">{organization_name}</span>
            </div>
            {project && (
              <div>
                <CreateNewDocumentButton
                  project_name={project_name}
                  project_id={project.id}
                />
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
    </div>
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
