import React from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import {
  CaretDownIcon,
  DotIcon,
  FileIcon,
  GearIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ViewGridIcon,
  ViewHorizontalIcon,
} from "@radix-ui/react-icons";
import { CreateNewFormButton } from "@/components/create-form-button";
import { Form } from "@/types";
import { ProjectStats } from "@/scaffolds/analytics/stats";
import { PoweredByGridaFooter } from "@/scaffolds/e/form/powered-by-brand-footer";
import { OrganizationAvatar } from "@/components/organization-avatar";
import { GridCard, RowCard } from "@/components/site/form-card";
import { PanelsTopLeftIcon } from "lucide-react";
import { WorkspaceMenu } from "./org-menu";
import { PublicUrls } from "@/services/public-urls";
import {
  SidebarMenuItem,
  SidebarMenuList,
  SidebarSectionHeader,
  SidebarSectionHeaderAction,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { CreateNewProjectDialog } from "./new-project-dialog";

export const revalidate = 0;

interface FormDashboardItem extends Form {
  responses: number;
}

export default async function DashboardProjectsPage({
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
    .eq("name", params.org)
    .single();

  if (err) console.error(err);
  if (!organization) {
    return notFound();
  }

  const avatar_url = PublicUrls.organization_avatar_url(supabase);

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
    <div className="h-full flex flex-1 w-full">
      <nav className="relative w-60 h-full shrink-0 overflow-y-auto border-e">
        <header className="sticky top-0 mx-2 pt-4 py-2 bg-background border-b">
          <WorkspaceMenu current={organization.id}>
            <SidebarMenuItem className="py-2">
              <OrganizationAvatar
                className="inline-flex align-middle w-6 h-6 me-2 border rounded"
                avatar_url={
                  organization.avatar_path
                    ? avatar_url(organization.avatar_path)
                    : undefined
                }
                alt={organization?.name}
              />
              <span>{organization.name}</span>
              <CaretDownIcon className="inline w-4 h-4 ms-2 text-muted-foreground" />
            </SidebarMenuItem>
          </WorkspaceMenu>
          <section className="my-2">
            <ul className="flex flex-col gap-0.5">
              <li>
                <SidebarMenuItem muted>
                  <HomeIcon className="inline align-middle me-2 w-4 h-4" />
                  <Link href="/dashboard">Home</Link>
                </SidebarMenuItem>
              </li>
              {/* <li>
                <MenuItem muted>
                  <MagnifyingGlassIcon className="inline align-middle me-2 w-4 h-4" />
                  <Link href="/dashboard/settings">Search</Link>
                </MenuItem>
              </li> */}
              {/* <li>
                <MenuItem muted>
                  <GearIcon className="inline align-middle me-2 w-4 h-4" />
                  <Link href="/dashboard/settings">Settings</Link>
                </MenuItem>
              </li> */}
            </ul>
          </section>
        </header>
        <div className="h-full">
          <section className="mx-2 mb-2">
            <SidebarSectionHeader>
              <SidebarSectionHeaderLabel>
                <span>Projects</span>
              </SidebarSectionHeaderLabel>
              <SidebarSectionHeaderActions>
                <CreateNewProjectDialog org={organization.name}>
                  <SidebarSectionHeaderAction>
                    <PlusIcon className="w-4 h-4" />
                  </SidebarSectionHeaderAction>
                </CreateNewProjectDialog>
              </SidebarSectionHeaderActions>
            </SidebarSectionHeader>
            <SidebarMenuList>
              {organization.projects.map((p) => {
                const projectforms = forms.filter((f) => f.project_id === p.id);
                return (
                  <>
                    <Link href={`/${organization.name}/${p.name}`}>
                      <SidebarMenuItem key={p.name} muted>
                        <PanelsTopLeftIcon className="inline align-middle me-2 w-4 h-4" />
                        {p.name}
                      </SidebarMenuItem>
                    </Link>

                    {projectforms.map((form, i) => (
                      <Link
                        key={form.id}
                        href={`/d/${form.id}`}
                        prefetch={false}
                      >
                        <SidebarMenuItem level={1} muted>
                          <DotIcon className="inline align-middle w-4 h-4 me-2" />
                          {form.title}
                        </SidebarMenuItem>
                      </Link>
                    ))}
                  </>
                );
              })}
            </SidebarMenuList>
          </section>
        </div>
      </nav>
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
          {organization.projects.map((p) => {
            const projectforms = forms.filter((f) => f.project_id === p.id);
            return (
              <div key={p.id} className="mb-10">
                <header className="py-4 mb-2 flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold">{p.name}</h2>
                  </div>
                  <CreateNewFormButton project_id={p.id} />
                </header>
                <section className="py-10">
                  <ProjectStats project_id={p.id} />
                </section>
                <FormsGrid forms={projectforms} layout={layout} />
              </div>
            );
          })}
          <footer className="mt-10 mb-5">
            <PoweredByGridaFooter />
          </footer>
        </div>
      </main>
    </div>
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
