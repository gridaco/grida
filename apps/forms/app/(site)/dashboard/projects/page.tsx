import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import { ViewGridIcon, ViewHorizontalIcon } from "@radix-ui/react-icons";
import { CreateNewFormButton } from "@/components/create-form-button";
import { Form } from "@/types";
import { Metadata } from "next";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { GridCard, RowCard } from "@/components/site/form-card";

export const revalidate = 0;

interface FormDashboardItem extends Form {
  responses: number;
}

export default async function DashboardProjectsPage({
  searchParams,
}: {
  searchParams: {
    layout?: "grid" | "list";
  };
}) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();

  const layout = searchParams.layout ?? "list";

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data: organization, error: err } = await wsclient
    .from("organization")
    .select(`*, projects:project(*)`)
    .limit(1)
    .single();

  if (err) console.error(err);
  if (!organization) {
    return notFound();
  }

  const avatar_url = organization.avatar_path
    ? supabase.storage.from("avatars").getPublicUrl(organization?.avatar_path)
        .data.publicUrl
    : null;

  // const project_id = project_ref.id;

  // fetch forms with responses count
  const { data: __forms, error } = await supabase
    .from("form")
    .select("*, response(count) ")
    .in(
      "project_id",
      organization.projects.map((p) => p.id)
    )
    .order("updated_at", { ascending: false });

  if (!__forms) {
    return notFound();
  }

  const forms: FormDashboardItem[] = __forms.map(
    (form) =>
      ({
        ...form,
        responses: (form.response as any as { count: number }[])[0]?.count || 0, // Unwrap count or default to 0 if no responses
      }) as FormDashboardItem
  );
  //

  return (
    <main className="container mx-auto px-4">
      <header className="py-10 flex justify-between">
        <div>
          <Link href="/dashboard" prefetch={false}>
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              <OrganizationAvatar
                avatar_url={avatar_url}
                alt={organization?.name}
              />
              Forms
            </span>
          </Link>
          <span className="font-mono opacity-50">{organization.name}</span>
        </div>
        <div>{/* <CreateNewFormButton project_id={project_id} /> */}</div>
      </header>
      <section>{/* <ProjectStats project_id={project_id} /> */}</section>
      <section className="w-full flex justify-end gap-2 mt-10">
        <Link href="?layout=grid" replace>
          <ViewGridIcon />
        </Link>
        <Link href="?layout=list" replace>
          <ViewHorizontalIcon />
        </Link>
      </section>
      <hr className="mb-10 mt-5 dark:border-neutral-700" />
      {organization.projects.map((p) => {
        const projectforms = forms.filter((f) => f.project_id === p.id);
        return (
          <div className="mb-10">
            <div className="py-4">
              <h2 className="text-2xl font-bold">{p.name}</h2>
            </div>
            <FormsGrid forms={projectforms} layout={layout} />
          </div>
        );
      })}
      <footer className="mt-10 mb-5">
        <PoweredByGridaFooter />
      </footer>
      <EditorHelpFab />
    </main>
  );
}

function FormsGrid({
  forms,
  layout,
}: {
  forms: FormDashboardItem[];
  layout: "grid" | "list";
}) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {forms?.map((form, i) => (
          <Link key={i} href={`/d/${form.id}`} prefetch={false}>
            <GridCard {...form} />
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
          <span className="ml-2 text-xs opacity-50">{forms.length}</span>
        </span>
        <span className="w-32">Responses</span>
        <span className="w-44">Updated At</span>
      </header>
      {forms?.map((form, i) => (
        <Link key={i} href={`/d/${form.id}`} prefetch={false}>
          <RowCard {...form} />
        </Link>
      ))}
    </div>
  );
}
