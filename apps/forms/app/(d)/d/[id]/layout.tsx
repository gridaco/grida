import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { EyeOpenIcon, SlashIcon } from "@radix-ui/react-icons";
import { Toaster } from "react-hot-toast";
import { Tabs } from "@/scaffolds/d/tabs";
import { FormEditorProvider } from "@/scaffolds/editor";

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
        blocks:form_block(*),
        fields:form_field(*),
        responses: response(*, fields:response_field(*))
      `
    )
    .eq("id", id)
    .single();

  if (!data) {
    console.error(id, error);
    return notFound();
  }

  return (
    <main className="min-h-screen h-screen flex flex-col">
      <Toaster position="bottom-center" />
      <header className="px-4 flex w-full gap-4 border-b dark:border-neutral-900">
        <div className="w-1/3 flex items-center justify-start">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-md font-black select-none">
              <GridaLogo size={15} />
              Forms
            </span>
          </Link>
          <SlashIcon className="min-w-[20px] ml-2" width={15} height={15} />
          <EditableFormTitle form_id={id} defaultValue={data.title} />
        </div>
        <div className="w-1/3 flex items-center justify-center gap-4">
          <Tabs form_id={id} />
        </div>
        <div className="w-1/3 flex gap-4 items-center justify-end">
          <Link href={"preview"} target="_blank">
            <button
              className="p-2 h-10 w-10 rounded bg-neutral-200"
              title="Preview"
            >
              <EyeOpenIcon className="mx-auto" width={20} height={20} />
            </button>
          </Link>
          <button
            className="px-4 py-2 h-10 rounded bg-neutral-200"
            title="Publish"
          >
            Publish
          </button>
        </div>
      </header>
      <FormEditorProvider
        initial={{
          form_id: id,
          fields: data.fields,
          responses: data.responses,
          blocks: data.blocks,
        }}
      >
        {children}
      </FormEditorProvider>
    </main>
  );
}
