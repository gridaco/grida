import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import {
  FileIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewFormButton } from "@/components/create-form-button";
import { Form } from "@/types";
import Image from "next/image";
import { Metadata } from "next";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { OrganizationAvatar } from "@/components/organization-avatar";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: { project_name: string };
}): Promise<Metadata> {
  const { project_name } = params;

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
    project_name: string;
  };
  searchParams: {
    layout?: "grid" | "list";
  };
}) {
  const { project_name } = params;

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
          <CreateNewFormButton project_id={project_id} />
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
      <FormsGrid forms={forms} layout={layout} />
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

function GridCard({
  title,
  responses,
  thumbnail,
  is_max_form_responses_in_total_enabled,
  max_form_responses_in_total,
}: FormDashboardItem & { thumbnail?: string }) {
  return (
    <div className="rounded border border-neutral-500/10 bg-white dark:bg-neutral-900 shadow-md">
      {thumbnail ? (
        <Image
          className="object-cover w-full h-full"
          width={240}
          height={300}
          src={thumbnail}
          alt="thumbnail"
        />
      ) : (
        <div className="p-2 aspect-square w-full flex items-center justify-center border-b">
          <FileIcon className="w-10 h-10" />
        </div>
      )}
      <div className="px-4 py-2 flex flex-col gap-2">
        <span>{title}</span>
        <span className="text-xs opacity-50">
          {is_max_form_responses_in_total_enabled ? (
            <>
              {responses} / {max_form_responses_in_total} responses
            </>
          ) : (
            <>{responses} responses</>
          )}
        </span>
      </div>
    </div>
  );
}

function RowCard({
  title,
  thumbnail,
  responses,
  created_at,
  updated_at,
  is_max_form_responses_in_total_enabled,
  max_form_responses_in_total,
}: FormDashboardItem & { thumbnail?: string }) {
  return (
    <div className="flex items-center border rounded-md overflow-hidden h-16 shadow bg-white dark:bg-neutral-900">
      {thumbnail ? (
        <Image
          className="object-cover max-w-16 bg-neutral-500 aspect-square"
          width={440}
          height={440}
          src={thumbnail}
          alt="thumbnail"
        />
      ) : (
        <div className="p-2 aspect-square h-full flex items-center justify-center border-r">
          <FileIcon className="w-5 h-5" />
        </div>
      )}
      <div className="flex-1 px-6 font-medium text-gray-900 whitespace-nowrap dark:text-white">
        <div className="flex flex-col">
          <span>{title}</span>
          <span className="text-xs font-normal opacity-50">
            Created: {new Date(created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="opacity-80 w-32 text-sm">
        {is_max_form_responses_in_total_enabled ? (
          <>
            {responses} / {max_form_responses_in_total}
          </>
        ) : (
          <>{responses}</>
        )}
      </div>
      <div className="opacity-80 w-44 text-sm">
        {new Date(updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}
