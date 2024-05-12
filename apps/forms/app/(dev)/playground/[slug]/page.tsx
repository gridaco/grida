import { createServerComponentClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Playground from "@/scaffolds/playground";

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
    .from("playground_gist")
    .select()
    .eq("slug", slug)
    .single();

  if (!_gist) {
    return redirect("/playground");
  }

  const { gist, prompt } = _gist;

  return (
    <main>
      <Playground
        initial={(gist && JSON.stringify(gist, null, 2)) || null}
        prompt={prompt || undefined}
        slug={slug}
      />
    </main>
  );
}
