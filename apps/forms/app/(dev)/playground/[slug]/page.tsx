import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Playground from "@/scaffolds/playground";

export const maxDuration = 60;

export default async function SharedPlaygroundPage({
  params,
}: {
  params: {
    slug: string;
  };
}) {
  const { slug } = params;
  const cookieStore = cookies();
  const supabase = createServerComponentClient(cookieStore);

  const { data: _gist } = await supabase
    .from("gist")
    .select()
    .eq("slug", slug)
    .single();

  if (!_gist) {
    return redirect("/playground");
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
