import Link from "next/link";
import { EditableDocumentTitle } from "@/scaffolds/editable-document-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { SlashIcon } from "@radix-ui/react-icons";
import { Sidebar } from "@/scaffolds/sidebar/sidebar";
import { EditorProvider, FormDocumentEditorProvider } from "@/scaffolds/editor";
import { PreviewButton } from "@/components/preview-button";
import { GridaXSupabaseService } from "@/services/x-supabase";
import type {
  EndingPageTemplateID,
  Form,
  FormBlock,
  FormFieldDefinition,
  FormPageBackgroundSchema,
  FormStyleSheetV1Schema,
} from "@/types";
import type {
  GDocEditorRouteParams,
  FormDocumentEditorInit,
} from "@/scaffolds/editor/state";
import { Breadcrumbs } from "@/scaffolds/workbench/breadcrumb";
import assert from "assert";
import { Metadata } from "next";
import { SavingIndicator } from "@/scaffolds/workbench/saving-indicator";
import { ThemeProvider } from "@/components/theme-provider";
import { ToasterWithMax } from "@/components/toaster";
import { EditorHelpFab } from "@/scaffolds/help/editor-help-fab";
import { Inter } from "next/font/google";
import { cn } from "@/utils";
import React from "react";

export const revalidate = 0;

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata({
  params,
}: {
  params: GDocEditorRouteParams;
}): Promise<Metadata> {
  const { id, proj } = params;
  const cookieStore = cookies();
  const supabase = createServerComponentWorkspaceClient(cookieStore);
  const { data, error } = await supabase
    .from("document")
    .select(`title`)
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  return {
    title: `${data.title} | ${proj}`,
  };
}

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: GDocEditorRouteParams;
}>) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);
  const { id, org, proj } = params;

  const { data: project_ref, error: project_ref_err } = await wsclient
    .from("project")
    .select("id, name, organization!inner(id, name)")
    .eq("name", proj)
    .eq("organization.name", org)
    .single();

  if (project_ref_err) {
    console.error("project_ref err", project_ref_err);
    return notFound();
  }

  if (!project_ref) {
    console.error("project_ref not found", proj);
    return notFound();
  }

  const { data: masterdoc_ref, error: masterdoc_ref_err } = await wsclient
    .from("document")
    .select("*")
    .eq("id", id)
    .single();

  if (masterdoc_ref_err) {
    console.error("masterdoc_ref err", masterdoc_ref_err);
    return notFound();
  }

  if (!masterdoc_ref) {
    console.error("masterdoc_ref not found", id);
    return notFound();
  }

  switch (masterdoc_ref.doctype) {
    case "v0_form": {
      const { data, error } = await supabase
        .from("form_document")
        .select(
          `
        *,
        blocks:form_block(*),
        form!form_id(
          *,
          fields:form_field(
            *,
            options:form_field_option(*),
            optgroups:optgroup(*)
          ),
          store_connection:connection_commerce_store(*),
          supabase_connection:connection_supabase(*)
        )
      `
        )
        .eq("project_id", project_ref.id)
        .eq("id", masterdoc_ref.id)
        .single();

      if (!data) {
        console.error("editorinit", id, error);
        return notFound();
      }

      const appearance =
        (data.stylesheet as FormStyleSheetV1Schema)?.appearance ?? "system";

      const client = new GridaXSupabaseService();

      const { form: _form } = data;
      assert(_form);
      const form = _form as any as Form & {
        supabase_connection: any;
        store_connection: any;
        fields: FormFieldDefinition[];
      };

      const supabase_connection_state = form.supabase_connection
        ? await client.getConnection(form.supabase_connection)
        : null;

      return (
        <Html>
          <FormDocumentEditorProvider
            initial={
              {
                doctype: "v0_form",
                project: { id: project_ref.id, name: project_ref.name },
                organization: {
                  id: project_ref.organization!.id,
                  name: project_ref.organization!.name,
                },
                connections: {
                  store_id: form.store_connection?.store_id,
                  supabase: supabase_connection_state || undefined,
                },
                theme: {
                  lang: data.lang,
                  is_powered_by_branding_enabled:
                    data.is_powered_by_branding_enabled,
                  appearance: appearance,
                  palette: (data?.stylesheet as FormStyleSheetV1Schema)
                    ?.palette,
                  fontFamily:
                    (data.stylesheet as FormStyleSheetV1Schema)?.[
                      "font-family"
                    ] ?? "inter",
                  section: (data.stylesheet as FormStyleSheetV1Schema)?.section,
                  customCSS: (data.stylesheet as FormStyleSheetV1Schema)
                    ?.custom,
                  background:
                    data.background as unknown as FormPageBackgroundSchema,
                },
                form_id: form.id,
                // TODO:
                form_title: form.title,
                campaign: {
                  is_scheduling_enabled: form.is_scheduling_enabled,
                  is_force_closed: form.is_force_closed,
                  max_form_responses_by_customer:
                    form.max_form_responses_by_customer,
                  is_max_form_responses_by_customer_enabled:
                    form.is_max_form_responses_by_customer_enabled,
                  max_form_responses_in_total: form.max_form_responses_in_total,
                  is_max_form_responses_in_total_enabled:
                    form.is_max_form_responses_in_total_enabled,
                  scheduling_open_at: form.scheduling_open_at,
                  scheduling_close_at: form.scheduling_close_at,
                  scheduling_tz: form.scheduling_tz || undefined,
                },
                form_security: {
                  unknown_field_handling_strategy:
                    form.unknown_field_handling_strategy,
                  method: data.method,
                },
                ending: {
                  is_redirect_after_response_uri_enabled:
                    data.is_redirect_after_response_uri_enabled,
                  redirect_after_response_uri: data.redirect_after_response_uri,
                  is_ending_page_enabled: data.is_ending_page_enabled,
                  ending_page_template_id:
                    data.ending_page_template_id as EndingPageTemplateID,
                  ending_page_i18n_overrides:
                    data.ending_page_i18n_overrides as any,
                },
                document_id: masterdoc_ref.id,
                document_title: masterdoc_ref.title,
                fields: form.fields,
                blocks: data.blocks as FormBlock[],
              } satisfies FormDocumentEditorInit
            }
          >
            <BaseLayout
              docid={masterdoc_ref.id}
              doctitle={masterdoc_ref.title}
              appearance={appearance}
              org={org}
              proj={proj}
            >
              {children}
            </BaseLayout>
          </FormDocumentEditorProvider>
        </Html>
      );
    }
    case "v0_site": {
      return (
        <Html>
          <EditorProvider
            initial={{
              doctype: "v0_site",
              project: { id: project_ref.id, name: project_ref.name },
              organization: {
                id: project_ref.organization!.id,
                name: project_ref.organization!.name,
              },
              document_id: masterdoc_ref.id,
              document_title: masterdoc_ref.title,
              theme: {
                appearance: "system",
                fontFamily: "inter",
                lang: "en",
                is_powered_by_branding_enabled: true,
              },
            }}
          >
            <BaseLayout
              docid={masterdoc_ref.id}
              doctitle={masterdoc_ref.title}
              org={org}
              proj={proj}
            >
              {/* <p>
                This document is a site document. Site documents are not
                supported yet.
              </p> */}
              {children}
            </BaseLayout>
          </EditorProvider>
        </Html>
      );
    }
  }
}

function Html({ children }: React.PropsWithChildren<{}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          inter.className,
          // to prevent the whole page from scrolling by sr-only or other hidden absolute elements
          "h-screen overflow-hidden"
        )}
      >
        {children}
      </body>
    </html>
  );
}

function BaseLayout({
  docid,
  doctitle,
  org,
  proj,
  appearance,
  children,
}: React.PropsWithChildren<{
  docid: string;
  doctitle: string;
  appearance?: string;
  org: string;
  proj: string;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={appearance}
      enableSystem
      disableTransitionOnChange
      storageKey={`theme-workbench-${docid}`}
    >
      <Header
        org={org}
        proj={proj}
        document={{
          id: docid,
          title: doctitle,
        }}
      />
      <div className="h-screen flex flex-col">
        <div className="flex flex-1 overflow-y-auto">
          <div className="h-full flex flex-1 w-full">
            {/* side */}
            <aside className="hidden lg:flex h-full">
              <Sidebar />
            </aside>
            <div className="w-full h-full overflow-x-hidden">{children}</div>
          </div>
        </div>
      </div>
      <EditorHelpFab />
      <ToasterWithMax position="bottom-center" max={5} />
    </ThemeProvider>
  );
}

function Header({
  org,
  proj,
  document: { id, title },
}: {
  org: string;
  proj: string;
  document: {
    id: string;
    title: string;
  };
}) {
  return (
    <header className="flex w-full gap-4 bg-background border-b z-10 h-12">
      <div className="h-full px-4 min-w-60 w-min flex items-center lg:border-e">
        <Link href={`/${org}/${proj}`} prefetch={false}>
          <span className="flex items-center gap-2 text-md font-black select-none">
            <GridaLogo size={15} />
          </span>
        </Link>
        <SlashIcon className="min-w-[20px] ms-2" width={15} height={15} />
        <EditableDocumentTitle id={id} defaultValue={title} />
      </div>
      <div className="flex-1 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Breadcrumbs />
          <SavingIndicator />
        </div>
        <div className="px-4 flex gap-4 items-center justify-end">
          <PreviewButton />
        </div>
      </div>
    </header>
  );
}
