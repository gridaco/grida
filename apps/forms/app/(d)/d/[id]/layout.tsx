import { Inter } from "next/font/google";
import Link from "next/link";
import { EditableFormTitle } from "@/scaffolds/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase/server";
import { GridaLogo } from "@/components/grida-logo";
import { EyeOpenIcon, SlashIcon } from "@radix-ui/react-icons";
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
    <main className="p-4 min-h-screen h-full">
      <header className="flex w-full gap-4">
        <div className="w-1/3 flex gap-2 items-center justify-start">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              <GridaLogo />
              Forms
            </span>
          </Link>
          <SlashIcon className="min-w-[20px]" width={20} height={20} />
          <EditableFormTitle form_id={id} defaultValue={data.title} />
        </div>
        <div className="w-1/3 flex items-center justify-center gap-4">
          <Link href={`/d/${id}/edit`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Design
            </button>
          </Link>
          <Link href={`/d/${id}/share`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Share
            </button>
          </Link>
          <Link href={`/d/${id}/responses`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Results
            </button>
          </Link>
          <Link href={`/d/${id}/developer`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Developer
            </button>
          </Link>
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
