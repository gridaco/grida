import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createServerComponentClient,
  workspaceclient,
} from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { ViewGridIcon, ViewHorizontalIcon } from "@radix-ui/react-icons";
import { CreateNewFormButton } from "@/components/create-form-button";
import { Form } from "@/types";
import Image from "next/image";
import { Metadata } from "next";

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

  const { data: auth } = await supabase.auth.getSession();

  const layout = searchParams.layout ?? "list";

  if (!auth.session) {
    return redirect("/sign-in");
  }

  // TODO: this needs a RLS guard.
  const { data: project_ref } = await workspaceclient
    .from("project")
    .select("id")
    .eq("name", project_name)
    .single();

  if (!project_ref) {
    return notFound();
  }

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

  const count = forms.length;

  return (
    <main className="container mx-auto px-4">
      <header className="py-10">
        <div>
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              <GridaLogo />
              Forms
            </span>
          </Link>
          <span className="font-mono opacity-50">{project_name}</span>
        </div>
        <h1 className="text-5xl font-mono font-black py-10 flex items-center gap-4">
          Dashboard
          <span className="text-2xl bg-neutral-500 text-white rounded-full py-2 px-3">
            {count}
          </span>
        </h1>
      </header>
      <section className="flex justify-end py-4">
        <CreateNewFormButton project_id={project_id} />
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
      <footer className="h-44" />
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
          <Link key={i} href={`/d/${form.id}`}>
            <GridCard {...form} thumbnail="/assets/placeholder-image.png" />
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-1 lg:grid-cols-1 gap-4">
      <header className="flex text-sm opacity-80">
        <span className="flex-1">Form</span>
        <span className="w-32">Responses</span>
        <span className="w-44">Updated At</span>
      </header>
      {forms?.map((form, i) => (
        <Link key={i} href={`/d/${form.id}`}>
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
  max_form_responses_in_total,
}: FormDashboardItem & { thumbnail: string }) {
  return (
    <div className="rounded border border-neutral-500/10 bg-white dark:bg-neutral-900 shadow-md">
      <Image
        className="object-cover w-full h-full"
        width={240}
        height={300}
        src={thumbnail}
        alt="thumbnail"
      />
      <div className="px-4 py-2 flex flex-col gap-2">
        <span>{title}</span>
        <span className="text-xs opacity-50">
          {max_form_responses_in_total ? (
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
  responses,
  created_at,
  updated_at,
  max_form_responses_in_total,
}: FormDashboardItem) {
  return (
    <div className="flex items-center border rounded-xl overflow-hidden h-16 shadow-md bg-white dark:bg-neutral-900">
      <Image
        className="object-cover max-w-16 bg-neutral-500 aspect-square"
        width={440}
        height={440}
        src={"/assets/placeholder-image.png"}
        alt="thumbnail"
      />
      <div className="flex-1 px-6 font-medium text-gray-900 whitespace-nowrap dark:text-white">
        <div className="flex flex-col">
          <span>{title}</span>
          <span className="text-xs font-normal opacity-50">
            Created: {new Date(created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="opacity-80 w-32 text-sm">
        {max_form_responses_in_total ? (
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
