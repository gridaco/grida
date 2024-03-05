import { createServerClient } from "@/lib/supabase";
import { cookies } from "next/headers";
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
    <main>
      <h1>Edit Form {data.title}</h1>
    </main>
  );
}
