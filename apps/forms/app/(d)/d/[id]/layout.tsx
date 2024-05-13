import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { EyeOpenIcon, SlashIcon } from "@radix-ui/react-icons";
import { Tabs } from "@/scaffolds/d/tabs";
import { FormEditorProvider } from "@/scaffolds/editor";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import { FormPage } from "@/types";
import { PreviewButton } from "@/components/preview-button";
import { ThemeProvider } from "@/components/theme-provider";
import "../../../editor.css";
import { ToasterWithMax } from "@/components/toaster";
import clsx from "clsx";

const inter = Inter({ subsets: ["latin"] });

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

export default async function RootLayout({
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
        store_connection:connection_commerce_store(*)
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    console.error(id, error);
    return notFound();
  }

  return (
    <html lang="en">
      <body
        className={clsx(
          inter.className,
          // to prevent the whole page from scrolling by sr-only or other hidden absolute elements
          "h-screen overflow-hidden"
        )}
      >
        {process.env.NEXT_PUBLIC_GAID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GAID} />
        )}
        <ToasterWithMax position="bottom-center" max={5} />
        <div className="h-screen flex flex-col">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <Header form_id={id} title={data.title} />
            <FormEditorProvider
              initial={{
                project_id: data.project_id,
                connections: {
                  store_id: data.store_connection?.store_id,
                },
                form_id: id,
                form_title: data.title,
                page_id: data.default_form_page_id,
                fields: data.fields,
                blocks: data.default_page
                  ? // there's a bug with supabase typegen, where the default_page will not be a array, but cast it to array.
                    // it's safe to assume as non array.
                    (data.default_page as unknown as FormPage).blocks || []
                  : [],
              }}
            >
              <div className="flex flex-1 overflow-y-auto">{children}</div>
            </FormEditorProvider>
          </ThemeProvider>
        </div>
      </body>
    </html>
  );
}

function Header({ form_id, title }: { form_id: string; title: string }) {
  return (
    <header className="px-4 flex flex-col w-full gap-4 border-b bg-white dark:bg-neutral-900 z-10">
      <div className="w-full flex gap-4">
        <div className="w-1/3 flex items-center justify-start">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-md font-black select-none">
              <GridaLogo size={15} />
              Forms
            </span>
          </Link>
          <SlashIcon className="min-w-[20px] ml-2" width={15} height={15} />
          <EditableFormTitle form_id={form_id} defaultValue={title} />
        </div>
        <div className="invisible lg:visible w-1/3">
          <Tabs form_id={form_id} />
        </div>
        <div className="w-1/3 flex gap-4 items-center justify-end">
          <PreviewButton form_id={form_id} />
        </div>
      </div>
      <div className="block lg:hidden">
        <Tabs form_id={form_id} />
      </div>
    </header>
  );
}
