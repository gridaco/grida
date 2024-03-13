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

  const { data: blocks } = await supabase
    .from("form_block")
    .select()
    .eq("form_id", id);

  if (!blocks) {
    return notFound();
  }

  return (
    <main className="p-4">
      <BlocksEditor
        initial={{
          blocks: blocks,
        }}
      />
    </main>
  );
}
