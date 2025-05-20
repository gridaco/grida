import { createFormsClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Playground from "@/scaffolds/playground-forms";

export const maxDuration = 60;

type Params = {
  slug: string;
};

export default async function SharedPlaygroundPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const client = await createFormsClient();

  const { data: _gist } = await client
    .from("gist")
    .select()
    .eq("slug", slug)
    .single();

  if (!_gist) {
    return redirect("/playground/forms");
  }

  const { data, prompt } = _gist;

  return (
    <main>
      <Playground
        initial={{
          src: (data as any)?.["form.json"],
          prompt: prompt || undefined,
          slug: slug,
        }}
      />
    </main>
  );
}
