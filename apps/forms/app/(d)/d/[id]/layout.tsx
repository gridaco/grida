import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { SlashIcon } from "@radix-ui/react-icons";
import { Tabs } from "@/scaffolds/d/tabs";
import { FormEditorProvider } from "@/scaffolds/editor";
import { FormPage } from "@/types";
import { PreviewButton } from "@/components/preview-button";
import { GridaXSupabaseService } from "@/services/x-supabase";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const id = params.id;

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
  params: { id: string };
}>) {
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);
  const id = params.id;

  const { data, error } = await supabase
    .from("form")
    .select(
      `
        *,
        fields:form_field(
          *,
          options:form_field_option(*)
        ),
        default_page:form_page!default_form_page_id(
          *,
          blocks:form_block(*)
        ),
        store_connection:connection_commerce_store(*),
        supabase_connection:connection_supabase(*)
      `
    )
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
  const default_page = data.default_page as unknown as FormPage;

  return (
    <div className="h-screen flex flex-col">
      <Header form_id={id} title={data.title} />
      <FormEditorProvider
        initial={{
          project_id: data.project_id,
          connections: {
            store_id: data.store_connection?.store_id,
            supabase: supabase_connection_state || undefined,
          },
          theme: {
            palette: default_page?.stylesheet?.palette,
            fontFamily: default_page.stylesheet?.["font-family"],
            section: default_page.stylesheet?.section,
            customCSS: default_page.stylesheet?.custom,
            background: default_page.background,
          },
          form_id: id,
          form_title: data.title,
          scheduling_tz: data.scheduling_tz || undefined,
          page_id: data.default_form_page_id,
          fields: data.fields,
          blocks: default_page ? default_page.blocks || [] : [],
        }}
      >
        <div className="flex flex-1 overflow-y-auto">{children}</div>
      </FormEditorProvider>
    </div>
  );
}

function Header({ form_id, title }: { form_id: string; title: string }) {
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
          <Tabs form_id={form_id} />
        </div>
        <div className="px-4 w-1/3 flex gap-4 items-center justify-end">
          <PreviewButton form_id={form_id} />
        </div>
      </div>
      <div className="px-4 block lg:hidden">
        <Tabs form_id={form_id} />
      </div>
    </header>
  );
}
