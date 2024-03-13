import { createServerClient } from "@/lib/supabase/server";
import BlocksEditor from "@/scaffolds/blocks-editor";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

export default async function EditFormPage({
  params,
}: {
  params: { id: string };
}) {
  const id = params.id;
  const cookieStore = cookies();
  const supabase = createServerClient(cookieStore);

  const { data } = await supabase
    .from("form")
    .select(`*, blocks:form_block(*), fields:form_field(*)`)
    .eq("id", id)
    .single();

  if (!data) {
    return notFound();
  }

  return (
    <main className="p-4 container mx-auto">
      <BlocksEditor
        initial={{
          form_id: id,
          fields: data.fields,
          blocks: data.blocks,
        }}
      />
    </main>
  );
}
