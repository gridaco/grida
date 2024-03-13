import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { EyeOpenIcon, SlashIcon } from "@radix-ui/react-icons";
import { Toaster } from "react-hot-toast";
import { Tabs } from "@/scaffolds/d/tabs";

export default async function Layout({
  params,
  children,
}: Readonly<{
  children: React.ReactNode;
  params: { id: string };
}>) {
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);
  const id = params.id;

  const { data, error } = await supabase
    .from("form")
    .select()
    .eq("id", id)
    .single();

  if (!data) {
    console.error(id, error);
    return notFound();
  }

  return (
    <main className="px-4 min-h-screen h-full">
      <Toaster position="bottom-center" />
      <header className="flex w-full gap-4 border-b">
        <div className="w-1/3 flex gap-2 items-center justify-start">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-xl font-black select-none">
              <GridaLogo size={20} />
              Forms
            </span>
          </Link>
          <SlashIcon className="min-w-[20px]" width={20} height={20} />
          <EditableFormTitle form_id={id} defaultValue={data.title} />
        </div>
        <div className="w-1/3 flex items-center justify-center gap-4">
          <Tabs form_id={id} />
        </div>
        <div className="w-1/3 flex gap-4 items-center justify-end">
          <Link href={"preview"} target="_blank">
            <button className="p-3 rounded bg-neutral-200" title="Preview">
              <EyeOpenIcon width={20} height={20} />
            </button>
          </Link>
          <button
            className="px-4 py-2 self-stretch rounded bg-neutral-200"
            title="Publish"
          >
            Publish
          </button>
        </div>
      </header>
      {children}
    </main>
  );
}
