import { EditableFormTitle } from "@/components/editable-form-title";
import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function EditFormPage({
  params,
}: {
  params: { id: string };
}) {
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
        <div className="justify-self-start">
          <EditableFormTitle value={data.title} />
        </div>
        <div className="justify-self-center flex gap-4">
          <Link href={`/d/${id}/responses`}>
            <button className="px-4 py-2 border-b-2 border-transparent hover:border-black">
              Create
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
    </main>
  );
}
