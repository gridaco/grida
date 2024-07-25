import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  createServerComponentClient,
  createServerComponentWorkspaceClient,
} from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { SlashIcon } from "@radix-ui/react-icons";
import { Tabs } from "@/scaffolds/d/tabs";
import { FormEditorProvider } from "@/scaffolds/editor";
import { FormDocument } from "@/types";
import { PreviewButton } from "@/components/preview-button";
import { GridaXSupabaseService } from "@/services/x-supabase";
import type { Metadata } from "next";

type Params = {
  org: string;
  proj: string;
  id: string;
};

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const id = params.id;

  // TODO: change to form_document after migration
  const { data, error } = await supabase
    .from("form")
    .select(
      `
        title
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  return {
    title: `${data.title} | Grida Forms`,
  };
}

export const revalidate = 0;

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Params;
}>) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const wsclient = createServerComponentWorkspaceClient(cookieStore);
  const { id, org, proj } = params;

  const { data: project_ref, error: project_ref_err } = await wsclient
    .from("project")
    .select("id, name, organization(id, name)")
    .eq("name", proj)
    .single();

  if (project_ref_err) {
    console.error(project_ref_err);
    return notFound();
  }

  if (!project_ref) {
    return notFound();
  }

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*)
        ),
        default_document:form_document!default_form_page_id(
          *,
          blocks:form_block(*)
        ),
        store_connection:connection_commerce_store(*),
        supabase_connection:connection_supabase(*)
      `
    )
    .eq("project_id", project_ref.id)
    .eq("id", id)
    .single();

  if (!data) {
    console.error("editorinit", id, error);
    return notFound();
  }

  const client = new GridaXSupabaseService();

  const supabase_connection_state = data.supabase_connection
    ? await client.getConnection(data.supabase_connection)
    : null;

  // there's a bug with supabase typegen, where the default_page will not be a array, but cast it to array.
  // it's safe to assume as non array.
  const default_document = data.default_document as unknown as FormDocument;

  return (
    <div className="h-screen flex flex-col">
      <Header
        org={params.org}
        proj={params.proj}
        form_id={id}
        title={data.title}
      />
      <FormEditorProvider
        initial={{
          project: { id: project_ref.id, name: project_ref.name },
          organization: {
            id: project_ref.organization!.id,
            name: project_ref.organization!.name,
          },
          connections: {
            store_id: data.store_connection?.store_id,
            supabase: supabase_connection_state || undefined,
          },
          theme: {
            lang: default_document.lang,
            is_powered_by_branding_enabled:
              default_document.is_powered_by_branding_enabled,
            palette: default_document?.stylesheet?.palette,
            fontFamily: default_document.stylesheet?.["font-family"],
            section: default_document.stylesheet?.section,
            customCSS: default_document.stylesheet?.custom,
            background: default_document.background,
          },
          form_id: id,
          form_title: data.title,
          scheduling_tz: data.scheduling_tz || undefined,
          form_document_id: data.default_form_page_id,
          fields: data.fields,
          blocks: default_document ? default_document.blocks || [] : [],
        }}
      >
        <div className="flex flex-1 overflow-y-auto">{children}</div>
      </FormEditorProvider>
    </div>
  );
}

function Header({
  org,
  proj,
  form_id,
  title,
}: {
  org: string;
  proj: string;
  form_id: string;
  title: string;
}) {
  return (
    <header className="flex flex-col w-full gap-4 bg-background border-b z-10">
      <div className="w-full flex gap-4">
        <div className="w-1/3">
          <div className="h-full px-4 min-w-60 w-min flex items-center lg:border-e">
            <Link href="/dashboard" prefetch={false}>
              <span className="flex items-center gap-2 text-md font-black select-none">
                <GridaLogo size={15} />
              </span>
            </Link>
            <SlashIcon className="min-w-[20px] ms-2" width={15} height={15} />
            <EditableFormTitle form_id={form_id} defaultValue={title} />
          </div>
        </div>
        <div className="px-4 invisible lg:visible w-1/3">
          <Tabs org={org} proj={proj} form_id={form_id} />
        </div>
        <div className="px-4 w-1/3 flex gap-4 items-center justify-end">
          <PreviewButton form_id={form_id} />
        </div>
      </div>
      <div className="px-4 block lg:hidden">
        <Tabs org={org} proj={proj} form_id={form_id} />
      </div>
    </header>
  );
}
