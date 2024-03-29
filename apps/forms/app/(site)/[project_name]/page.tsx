import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createServerComponentClient,
  workspaceclient,
} from "@/lib/supabase/server";
import { DashboardFormCard } from "@/components/dashboard-form-card";
import { GridaLogo } from "@/components/grida-logo";
import { PlusIcon } from "@radix-ui/react-icons";
import { CreateNewFormButton } from "@/components/create-form-button";

export const revalidate = 0;

export default async function FormsDashboardPage({
  params,
}: {
  params: {
    project_name: string;
  };
}) {
  const { project_name } = params;

  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: auth } = await supabase.auth.getSession();

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

  const { data: forms, error } = await supabase
    .from("form")
    .select()
    .eq("project_id", project_id);

  const count = forms?.length || 0;

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
      <hr className="my-10 dark:border-neutral-700" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {forms?.map((form, i) => (
          <Link key={i} href={`/d/${form.id}`}>
            <DashboardFormCard
              title={form.title}
              thumbnail="/assets/placeholder-image.png"
            />
          </Link>
        ))}
      </div>
    </main>
  );
}
