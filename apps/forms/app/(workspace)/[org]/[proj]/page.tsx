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
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { GridCard, RowCard } from "@/components/site/form-card";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { proj: string };
}): Promise<Metadata> {
  const { proj: project_name } = params;

  return {
    title: `${project_name} | Grida Forms`,
  };
}

interface FormDashboardItem extends Form {
  responses: number;
}

export default async function FormsDashboardPage({
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
  const { org: organization_name, proj: project_name } = params;

  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);

  const { data: auth } = await supabase.auth.getUser();

  const layout = searchParams.layout ?? "list";

  if (!auth.user) {
    return redirect("/sign-in");
  }

  const { data: project_ref, error: _project_ref_err } = await wsclient
    .from("project")
    .select("id, organization:organization(id, name, avatar_path)")
    .eq("name", project_name)
    // TODO: in theory, there can be multiple projects with the same name in different organizations that the user is part of
    .limit(1)
    .single();

  if (_project_ref_err) console.error(_project_ref_err);
  if (!project_ref) {
    return notFound();
  }

  const avatar_url = project_ref.organization?.avatar_path
    ? supabase.storage
        .from("avatars")
        .getPublicUrl(project_ref.organization?.avatar_path).data.publicUrl
    : null;

  const project_id = project_ref.id;

  // fetch forms with responses count
  const { data: __forms, error } = await supabase
    .from("form")
    .select("*, response(count) ")
    .eq("project_id", project_id)
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
                alt={project_ref.organization?.name}
              />
              Forms
            </span>
          </Link>
          <span className="font-mono opacity-50">{project_name}</span>
        </div>
        <div>
          <CreateNewFormButton
            organization_name={organization_name}
            project_name={project_name}
            project_id={project_id}
          />
        </div>
      </header>
      <section>
        <ProjectStats project_id={project_id} />
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
      <FormsGrid
        organization_name={organization_name}
        project_name={project_name}
        forms={forms}
        layout={layout}
      />
      <footer className="mt-10 mb-5">
        <PoweredByGridaFooter />
      </footer>
    </main>
  );
}

function FormsGrid({
  organization_name,
  project_name,
  forms,
  layout,
}: {
  organization_name: string;
  project_name: string;
  forms: FormDashboardItem[];
  layout: "grid" | "list";
}) {
  if (layout === "grid") {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {forms?.map((form, i) => (
          <Link
            key={i}
            href={`/${organization_name}/${project_name}/${form.id}`}
            prefetch={false}
          >
            <GridCard
              // TODO:
              supabase_connection={null}
              {...form}
            />
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
        <Link
          key={i}
          href={`/${organization_name}/${project_name}//${form.id}`}
          prefetch={false}
        >
          <RowCard
            // TODO:
            supabase_connection={null}
            {...form}
          />
        </Link>
      ))}
    </div>
  );
}
