import { Inter } from "next/font/google";
import Link from "next/link";
import { EditableFormTitle } from "@/components/editable-form-title";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";
import { GridaLogo } from "@/components/grida-logo";
import { SlashIcon } from "@radix-ui/react-icons";
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
    <main className="p-4">
      <header className="flex w-full gap-4">
        <div className="flex gap-4 items-center justify-self-start">
          <Link href="/dashboard">
            <span className="flex items-center gap-2 text-2xl font-black select-none">
              <GridaLogo />
              Forms
            </span>
          </Link>
          <SlashIcon />
          <EditableFormTitle value={data.title} />
        </div>
        <div className="justify-self-center flex gap-4">
          <Link href={`/d/${id}/edit`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Design
            </button>
          </Link>
          <Link href={`/d/${id}/edit`}>
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
      </header>
      {children}
    </main>
  );
}
