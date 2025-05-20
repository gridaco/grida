import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import {
  service_role,
  createClient,
  createFormsClient,
  createStorageClient,
  createCanvasClient,
  createXSBClient,
} from "@/lib/supabase/server";
import { EditorSidebar } from "@/scaffolds/sidebar/sidebar";
import { EditorProvider, FormDocumentEditorProvider } from "@/scaffolds/editor";
import { GridaXSupabaseService } from "@/services/x-supabase";
import type { CanvasDocumentSnapshotSchema } from "@/types";
import type {
  Form,
  FormFieldDefinition,
  FormBlock,
  EndingPageTemplateID,
  FormPageBackgroundSchema,
  FormStyleSheetV1Schema,
} from "@/grida-forms/hosted/types";
import type {
  GDocEditorRouteParams,
  FormDocumentEditorInit,
  TableXSBMainTableConnection,
} from "@/scaffolds/editor/state";
import { Breadcrumbs } from "@/scaffolds/workbench/breadcrumb";
import assert from "assert";
import { Metadata } from "next";
import { SavingIndicator } from "@/scaffolds/workbench/saving-indicator";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { EditorHelpFab } from "@/scaffolds/globals/editor-help-fab";
import { Inter } from "next/font/google";
import { cn } from "@/components/lib/utils";
import React from "react";
import { PlayActions } from "@/scaffolds/workbench/play-actions";
import Players from "@/scaffolds/workbench/players";
import { DontCastJsonProperties } from "@/types/supabase-ext";
import { xsb_table_conn_init } from "@/scaffolds/editor/init";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Win32LinuxWindowSafeArea } from "@/scaffolds/desktop";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata({
  params,
}: {
  params: Promise<GDocEditorRouteParams>;
}): Promise<Metadata> {
  const { id, proj } = await params;
  const client = await createClient();

  const { data, error } = await client
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
  params: Promise<GDocEditorRouteParams>;
}>) {
  const { id, org, proj } = await params;

  // in local dev, the vercel insights script is not loaded, will hit this route
  if (org.startsWith("_")) return notFound();

  const cookieStore = await cookies();
  const client = await createClient();
  const formsClient = await createFormsClient();

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return redirect("/sign-in");
  }

  // mark only. no need to await
  client
    .rpc("workspace_mark_access", {
      p_organization_name: org,
      p_project_name: proj,
      p_document_id: id,
    })
    .then();

  const { data: project_ref, error: project_ref_err } = await client
    .from("project")
    .select("id, name, organization!inner(id, name)")
    .eq("name", proj)
    .eq("organization.name", org)
    .single();

  if (project_ref_err) {
    console.error("project_ref err", project_ref_err, { id, org, proj });
    return notFound();
  }

  if (!project_ref) {
    console.error("project_ref not found", proj);
    return notFound();
  }

  const { data: masterdoc_ref, error: masterdoc_ref_err } = await client
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
      const { data, error } = await formsClient
        .from("form_document")
        .select(
          `
        *,
        blocks:form_block(*),
        form!form_id(
          *,
          fields:attribute(
            *,
            options:option(*),
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
        ? await client.getXSBMainTableConnectionState(form.supabase_connection)
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
                user_id: user.id,
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
                start: data.start_page,
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
            <BaseLayout docid={masterdoc_ref.id}>{children}</BaseLayout>
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
              user_id: user.id,
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
            <BaseLayout docid={masterdoc_ref.id}>
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
    case "v0_schema": {
      const { data, error } = await formsClient
        .from("schema_document")
        .select(
          `
            *,
            tables:form(
              *,
              fields:attribute(
                *,
                options:option(*),
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

      // get project supabase project
      const { data: supabase_project } = await service_role.xsb
        .from("supabase_project")
        .select("*")
        .eq("project_id", project_ref.id)
        .single();

      if (!data) {
        console.error("editorinit", id, error);
        return notFound();
      }

      // get x-supabase coonnected tables
      const xsbClient = await createXSBClient();
      const { data: xsb_tables, error: xsb_tables_err } = await xsbClient
        .from("supabase_table")
        .select("*")
        .in(
          "id",
          data.tables
            .map((t) => t.supabase_connection?.main_supabase_table_id)
            .filter((x) => x) as number[]
        );

      if (xsb_tables_err) {
        console.error("xsb_tables_err", xsb_tables_err);
      }

      const makeconn = (
        sb_table_id: number
      ): TableXSBMainTableConnection | undefined => {
        const t = xsb_tables?.find((t) => t.id === sb_table_id);
        if (!t) return undefined;

        return xsb_table_conn_init({
          supabase_project_id: t.supabase_project_id,
          sb_table_id,
          sb_schema_name: t.sb_schema_name,
          sb_table_name: t.sb_table_name,
          sb_table_schema: t.sb_table_schema as any,
          sb_postgrest_methods: t.sb_postgrest_methods,
        });
      };

      return (
        <Html>
          <EditorProvider
            initial={{
              doctype: "v0_schema",
              supabase_project: supabase_project
                ? (supabase_project as DontCastJsonProperties<
                    typeof supabase_project,
                    | "sb_public_schema"
                    | "sb_schema_definitions"
                    | "sb_schema_openapi_docs"
                  >)
                : null,
              project: { id: project_ref.id, name: project_ref.name },
              organization: {
                id: project_ref.organization!.id,
                name: project_ref.organization!.name,
              },
              user_id: user.id,
              tables: data.tables.map((ft) => ({
                id: ft.id,
                // TODO: this should be migrated from database
                name: ft.title,
                description: ft.description,
                attributes: ft.fields,
                x_sb_main_table_connection: ft.supabase_connection
                  ?.main_supabase_table_id
                  ? makeconn(ft.supabase_connection.main_supabase_table_id)
                  : undefined,
              })),
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
            <BaseLayout docid={masterdoc_ref.id}>{children}</BaseLayout>
          </EditorProvider>
        </Html>
      );
    }
    case "v0_bucket": {
      const storageclient = await createStorageClient();
      const { data, error } = await storageclient
        .from("bucket_document")
        .select("*")
        .eq("id", masterdoc_ref.id)
        .single();

      if (!data) {
        console.error("editorinit", id, error);
        return notFound();
      }

      return (
        <Html>
          <EditorProvider
            initial={{
              doctype: "v0_bucket",
              project: { id: project_ref.id, name: project_ref.name },
              organization: {
                id: project_ref.organization!.id,
                name: project_ref.organization!.name,
              },
              user_id: user.id,
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
            <BaseLayout docid={masterdoc_ref.id}>{children}</BaseLayout>
          </EditorProvider>
        </Html>
      );

      break;
    }
    case "v0_canvas": {
      const canvasclient = await createCanvasClient();

      const { data, error } = await canvasclient
        .from("canvas_document")
        .select("*")
        .eq("id", masterdoc_ref.id)
        .single();

      if (!data) {
        console.error("editorinit", id, error);
        return notFound();
      }

      return (
        <Html>
          <EditorProvider
            initial={{
              doctype: "v0_canvas",
              project: { id: project_ref.id, name: project_ref.name },
              organization: {
                id: project_ref.organization!.id,
                name: project_ref.organization!.name,
              },
              user_id: user.id,
              document_id: masterdoc_ref.id,
              document_title: masterdoc_ref.title,
              theme: {
                appearance: "system",
                fontFamily: "inter",
                lang: "en",
                is_powered_by_branding_enabled: true,
              },
              document: data.data as unknown as CanvasDocumentSnapshotSchema,
            }}
          >
            <BaseLayout docid={masterdoc_ref.id}>{children}</BaseLayout>
          </EditorProvider>
        </Html>
      );
    }
    case "v0_campaign_referral": {
      redirect(`/${org}/${proj}/campaigns/${id}`);
    }
    default: {
      console.error("unsupported doctype", masterdoc_ref.doctype);
      redirect("/");
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
  appearance,
  children,
}: React.PropsWithChildren<{
  docid: string;
  appearance?: string;
}>) {
  return (
    <div className="h-screen flex flex-col">
      <ThemeProvider
        defaultTheme={appearance}
        storageKey={`theme-workbench-${docid}`}
      >
        <SidebarProvider>
          <div className="flex flex-1 overflow-y-auto">
            <div className="h-full flex flex-1 w-full">
              {/* side */}
              <EditorSidebar />
              <div className="flex flex-col overflow-hidden w-full h-full">
                {/* top */}
                <header className="px-2 h-11 min-h-11 flex items-center border-b bg-sidebar desktop-drag-area">
                  <div className="ms-2 flex items-center gap-4 flex-1">
                    <Breadcrumbs />
                    <SavingIndicator />
                  </div>
                  <div className="flex gap-4 items-center">
                    <Players />
                    <PlayActions />
                  </div>
                  <Win32LinuxWindowSafeArea />
                </header>
                {/* main */}
                <div className="w-full h-full overflow-x-hidden">
                  {children}
                </div>
              </div>
            </div>
          </div>
          <EditorHelpFab />
          <Toaster position="bottom-center" />
        </SidebarProvider>
      </ThemeProvider>
    </div>
  );
}
